// Recebe os eventos do webhook: registra tudo no CRM e roda a automação
// (por padrão só para quem chegou por anúncio).
import { config } from '../config.js';
import { enviarTexto, enviarMidia, idsEnviados } from './evolution.js';
import { entender, arosPara, AROS } from './entender.js';
import {
  contato, garantirContato, atualizarContato, registrarRecebida, registrarEnviada, ajuste,
} from './db.js';

// Envios em andamento por contato: o webhook do nosso próprio envio pode chegar antes da resposta da API
const enviando = new Map(); // jid -> { emCurso, fimEm }
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera os envios em curso para esse contato terminarem (no máx. 2 min) e mais um respiro
async function foiEnviadaPorNos(jid, waId) {
  for (let i = 0; i < 240 && (enviando.get(jid)?.emCurso ?? 0) > 0; i++) await pausa(500);
  if (!idsEnviados.has(waId)) await pausa(1500);
  return idsEnviados.has(waId);
}

async function enviar(jid, autor, envio, registro) {
  const e = enviando.get(jid) ?? { emCurso: 0, fimEm: 0 };
  enviando.set(jid, e);
  e.emCurso++;
  try {
    const res = await envio();
    registrarEnviada({ waId: res?.key?.id, jid, autor, ...registro });
  } finally {
    e.emCurso--;
    e.fimEm = Date.now();
  }
}

export const enviarTextoComo = (jid, autor, texto) =>
  enviar(jid, autor, () => enviarTexto(jid, texto), { tipo: 'texto', texto });

function textoDa(msg = {}) {
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.fileName ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  ).trim();
}

const TIPOS = {
  imageMessage: 'imagem', videoMessage: 'video', audioMessage: 'audio', documentMessage: 'documento',
  stickerMessage: 'figurinha', locationMessage: 'localizacao', contactMessage: 'contato',
};
const tipoDa = (msg = {}) => Object.keys(msg).map((k) => TIPOS[k]).find(Boolean) ?? 'texto';

// Prefere o número de telefone quando o WhatsApp manda o contato como @lid
function jidDo(key) {
  const candidatos = [key.remoteJid, key.remoteJidAlt, key.senderPn];
  return candidatos.find((j) => j?.endsWith('@s.whatsapp.net')) || key.remoteJid;
}

// Anúncio "clique para WhatsApp": a 1ª mensagem traz contextInfo.externalAdReply
function acharChave(obj, chave, prof = 0) {
  if (!obj || typeof obj !== 'object' || prof > 6) return undefined;
  if (obj[chave]) return obj[chave];
  for (const v of Object.values(obj)) {
    const achado = acharChave(v, chave, prof + 1);
    if (achado) return achado;
  }
}

export function detectarAnuncio(d) {
  const fonte = { message: d.message, contextInfo: d.contextInfo };
  const ad = acharChave(fonte, 'externalAdReply');
  const conversao = acharChave(fonte, 'conversionSource') || acharChave(fonte, 'entryPointConversionSource');
  const ehAnuncio = (ad && (ad.sourceType === 'ad' || ad.ctwaClid || ad.sourceId)) || /ads?|ctwa/i.test(conversao || '');
  if (!ehAnuncio) return null;
  return {
    titulo: ad?.title || null,
    texto: ad?.body || null,
    url: ad?.sourceUrl || null,
    id: ad?.sourceId || null,
    clid: ad?.ctwaClid || null,
  };
}

const lerPerfil = (c) => { try { return JSON.parse(c.perfil || '{}'); } catch { return {}; } };

export function criarBot({ catalogo, publicUrl }) {
  const mandar = (jid, texto) => enviarTextoComo(jid, 'bot', texto);

  function salvar(jid, etapa, perfil) {
    atualizarContato(jid, { etapa, perfil: JSON.stringify(perfil) });
  }

  // Passa para uma pessoa: avisa o cliente e o bot fica calado com ele
  async function chamarAtendente(jid, c, texto) {
    await mandar(jid, texto);
    atualizarContato(jid, {
      etapa: null,
      perfil: null,
      status: c.status === 'novo' ? 'em atendimento' : c.status,
      pausado_ate: Date.now() + config.pausaHoras * 3600_000,
    });
  }

  async function enviarBicicleta(jid, bike, perfil) {
    await mandar(jid, config.enviandoFotos(bike.nome));
    for (const arq of bike.arquivos) {
      if (arq.tipo === 'video' && arq.mb > config.videoMaxMB) {
        console.warn(`vídeo grande demais, pulando: ${bike.pasta}/${arq.nome} (${arq.mb.toFixed(0)} MB)`);
        continue;
      }
      const url = `${publicUrl}/midia/${encodeURIComponent(bike.pasta)}/${encodeURIComponent(arq.nome)}`;
      await enviar(jid, 'bot',
        () => enviarMidia(jid, { tipo: arq.tipo, mimetype: arq.mimetype, fileName: arq.nome, url }),
        { tipo: arq.tipo === 'video' ? 'video' : 'imagem', texto: `${bike.nome} — ${arq.nome}` });
    }
    await mandar(jid, config.depoisDasFotos);
    salvar(jid, 'pos-fotos', { ...perfil, opcoes: undefined, tentativas: 0 });
  }

  // Com o que já sabemos do cliente, decide: perguntar, recomendar ou mandar fotos
  async function fluxoBicicleta(jid, c, perfil) {
    const aros = perfil.aro ? [perfil.aro] : arosPara(perfil);

    if (!aros.length) {
      if (!perfil.genero) {
        await mandar(jid, config.perguntaPerfil);
        return salvar(jid, 'perfil', perfil);
      }
      await mandar(jid, config.tabelaAros);
      return salvar(jid, 'aro', perfil);
    }

    const recomendacao = perfil.aro || perfil.recomendou ? '' : config.recomendacao(perfil, aros);
    const opcoes = catalogo().filter((b) => aros.includes(b.aro));
    if (!opcoes.length) {
      if (recomendacao) await mandar(jid, recomendacao);
      return chamarAtendente(jid, c, config.semFotos(aros));
    }

    let lista = opcoes;
    if (perfil.genero) {
      const doGenero = opcoes.filter((b) => b.tipo === perfil.genero || b.tipo === null);
      if (doGenero.length) lista = doGenero;
    } else if (opcoes.some((b) => b.tipo)) {
      // tem versão masculina/feminina: pergunta antes de listar
      if (recomendacao) await mandar(jid, recomendacao);
      await mandar(jid, config.perguntaGenero);
      return salvar(jid, 'perfil', {
        ...perfil, aro: perfil.aro ?? (aros.length === 1 ? aros[0] : undefined), recomendou: !!recomendacao,
      });
    }

    if (recomendacao) await mandar(jid, recomendacao);
    if (lista.length === 1) return enviarBicicleta(jid, lista[0], perfil);

    await mandar(jid, config.escolhaModelo(lista.map((b, i) => `*${i + 1}* - ${b.nome}`).join('\n')));
    salvar(jid, 'escolha', { ...perfil, opcoes: lista.map((b) => b.pasta) });
  }

  // Não entendeu: tenta de novo uma vez, na segunda chama o atendente
  async function naoEntendeu(jid, c, perfil, texto) {
    const tentativas = (perfil.tentativas ?? 0) + 1;
    if (tentativas >= 2) return chamarAtendente(jid, c, config.naoEntendiFinal);
    await mandar(jid, texto);
    salvar(jid, c.etapa, { ...perfil, tentativas });
  }

  return async function processar(evento) {
    if (evento?.event !== 'messages.upsert') return;
    const d = evento.data;
    if (!d?.key || !d.message) return;

    const jid = jidDo(d.key);
    if (!jid || jid.endsWith('@g.us') || jid.includes('broadcast') || jid.endsWith('@newsletter')) return;

    // Mensagens antigas (sincronização de histórico) ficam de fora
    const ts = Number(d.messageTimestamp) * 1000;
    if (ts && Date.now() - ts > 2 * 60_000) return;

    const telefone = jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : null;
    garantirContato(jid, { nome: d.key.fromMe ? null : d.pushName, telefone });
    const texto = textoDa(d.message);
    const tipo = tipoDa(d.message);

    // Saiu deste WhatsApp sem ser por nós → atendente respondendo pelo celular: registra e pausa o bot
    if (d.key.fromMe) {
      if (await foiEnviadaPorNos(jid, d.key.id)) return;
      registrarRecebida({ waId: d.key.id, jid, autor: 'atendente', tipo, texto });
      const c = contato(jid);
      atualizarContato(jid, { pausado_ate: Math.max(c.pausado_ate, Date.now() + config.pausaHoras * 3600_000) });
      return;
    }

    registrarRecebida({ waId: d.key.id, jid, autor: 'cliente', tipo, texto });

    // "#teste" faz a conversa se comportar como vinda de anúncio (para testar a automação)
    const ehTeste = texto.toLowerCase() === '#teste';
    const anuncio = detectarAnuncio(d) ?? (ehTeste ? { titulo: 'Teste (#teste)' } : null);
    if (anuncio) {
      atualizarContato(jid, {
        origem: 'anuncio', anuncio_titulo: anuncio.titulo, anuncio_texto: anuncio.texto, anuncio_url: anuncio.url,
        anuncio_id: anuncio.id, ctwa_clid: anuncio.clid, anuncio_em: Date.now(),
      });
    }

    const c = contato(jid);
    if (ajuste('bot_ativo', '1') !== '1') return;
    if (config.automacao === 'anuncio' && c.origem !== 'anuncio') return;
    if (Date.now() < c.pausado_ate) return;

    const novaConversa = anuncio || !c.etapa || Date.now() - c.visto_em > config.sessaoMinutos * 60_000;
    atualizarContato(jid, { visto_em: Date.now() });

    const e = entender(ehTeste ? '' : texto);
    let perfil = novaConversa ? {} : lerPerfil(c);
    for (const k of ['genero', 'idade', 'altura', 'aro']) if (e[k] != null) perfil[k] = e[k];
    // idade/altura nova vale mais que um aro escolhido antes
    if ((e.idade != null || e.altura) && !e.aro) {
      delete perfil.aro;
      delete perfil.recomendou;
    }

    // Foto, áudio, vídeo do cliente: sem IA não dá para entender → pessoa
    if (tipo !== 'texto' && !texto) return chamarAtendente(jid, c, config.midiaDoCliente);

    if (novaConversa) {
      await mandar(jid, config.saudacao);
      // A 1ª mensagem já diz o que quer ("quero bike aro 20 pra menina")? Segue direto
      if (e.temPerfil && !e.pecas && !e.manutencao) return fluxoBicicleta(jid, contato(jid), perfil);
      return salvar(jid, 'interesse', perfil);
    }

    // Intenções que valem em qualquer etapa
    if (e.atendente) return chamarAtendente(jid, c, config.atendente);
    if (e.manutencao && !e.temPerfil) return chamarAtendente(jid, c, config.manutencao);
    if (e.pecas && !e.bicicleta && !e.temPerfil) return chamarAtendente(jid, c, config.pecas);
    if (e.temPerfil) return fluxoBicicleta(jid, c, perfil);
    if (e.endereco) return mandar(jid, config.endereco);
    if (e.pagamento) return mandar(jid, config.pagamento);
    if (e.preco) return chamarAtendente(jid, c, config.preco);

    // Resposta curta que só faz sentido na etapa atual
    switch (c.etapa) {
      case 'interesse':
        if (e.bicicleta) return fluxoBicicleta(jid, c, perfil);
        return naoEntendeu(jid, c, perfil, config.naoEntendi);

      case 'perfil':
        // perguntamos a idade: número solto é idade (ou altura em cm, se for grande)
        if (e.numero != null) {
          if (e.numero >= 80) perfil.altura = e.numero;
          else perfil.idade = e.numero;
          return fluxoBicicleta(jid, c, perfil);
        }
        if (e.bicicleta) return fluxoBicicleta(jid, c, perfil);
        return naoEntendeu(jid, c, perfil, config.perguntaPerfil);

      case 'aro':
        if (AROS.includes(e.numero)) return fluxoBicicleta(jid, c, { ...perfil, aro: e.numero });
        return naoEntendeu(jid, c, perfil, config.naoEntendiAro);

      case 'escolha': {
        const pasta = perfil.opcoes?.[e.numero - 1];
        const bike = pasta && catalogo().find((b) => b.pasta === pasta);
        if (bike) return enviarBicicleta(jid, bike, perfil);
        if (AROS.includes(e.numero)) return fluxoBicicleta(jid, c, { ...perfil, aro: e.numero });
        return naoEntendeu(jid, c, perfil, config.naoEntendiEscolha);
      }

      case 'pos-fotos':
        if (e.sim) return chamarAtendente(jid, c, config.interesse);
        if (AROS.includes(e.numero)) return fluxoBicicleta(jid, c, { ...perfil, aro: e.numero });
        if (e.bicicleta) return fluxoBicicleta(jid, c, perfil);
        return naoEntendeu(jid, c, perfil, config.depoisDasFotos);

      default:
        return naoEntendeu(jid, c, perfil, config.naoEntendi);
    }
  };
}
