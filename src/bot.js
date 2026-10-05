// Recebe os eventos do webhook: registra tudo no CRM e roda a automação
// (por padrão só para quem chegou por anúncio).
import { config } from '../config.js';
import { enviarTexto, enviarMidia, enviarAudio, baixarMidia, idsEnviados } from './evolution.js';
import { entender, arosPara, AROS } from './entender.js';
import { DIR_RECEBIDOS, salvarBase64, tipoPorMime } from './arquivos.js';
import { iaAtiva, pensar } from './ia.js';
import {
  contato, garantirContato, atualizarContato, registrarRecebida, registrarEnviada, definirMidia, ajuste, mensagensDe,
} from './db.js';

// Baixa a foto/vídeo/áudio/documento da mensagem e guarda para o CRM mostrar
const TIPOS_COM_MIDIA = new Set(['imagem', 'video', 'audio', 'documento', 'figurinha']);
async function guardarMidia(waId, tipo) {
  if (!waId || !TIPOS_COM_MIDIA.has(tipo)) return;
  try {
    const m = await baixarMidia(waId);
    if (!m) return;
    const nome = salvarBase64(DIR_RECEBIDOS, m.base64, m.mimetype);
    definirMidia(waId, `/crm/midia/${nome}`, m.mimetype);
  } catch (e) {
    console.error('mídia não baixada:', e.message);
  }
}

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

// Arquivo enviado pelo painel. url = link público que a Evolution baixa; áudio vai como mensagem de voz
export function enviarArquivoComo(jid, autor, { url, mimetype, nomeOriginal, legenda }) {
  const tipo = tipoPorMime(mimetype);
  const registro = { tipo, midiaUrl: new URL(url).pathname, mimetype };
  if (tipo === 'audio') return enviar(jid, autor, () => enviarAudio(jid, url), { ...registro, texto: '' });
  const mediatype = { imagem: 'image', video: 'video' }[tipo] ?? 'document';
  return enviar(jid, autor,
    () => enviarMidia(jid, { tipo: mediatype, url, mimetype, fileName: nomeOriginal, caption: legenda || undefined }),
    { ...registro, texto: legenda || (tipo === 'documento' ? nomeOriginal : '') });
}

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

  // Foto + vídeo da bike destaque da pasta, e pergunta se gostou
  async function enviarBicicleta(jid, bike, perfil, e = {}) {
    for (const [i, arq] of bike.envio.entries()) {
      if (arq.tipo === 'video' && arq.mb > config.videoMaxMB) {
        console.warn(`vídeo grande demais, pulando: ${bike.pasta}/${arq.nome} (${arq.mb.toFixed(0)} MB)`);
        continue;
      }
      const url = `${publicUrl}/midia/${encodeURIComponent(bike.pasta)}/${encodeURIComponent(arq.nome)}`;
      await enviar(jid, 'bot',
        () => enviarMidia(jid, {
          tipo: arq.tipo, mimetype: arq.mimetype, fileName: arq.nome, url,
          caption: i === 0 ? `*${bike.nome}*` : undefined,
        }),
        {
          tipo: arq.tipo === 'video' ? 'video' : 'imagem',
          texto: i === 0 ? bike.nome : '',
          midiaUrl: `/midia/${encodeURIComponent(bike.pasta)}/${encodeURIComponent(arq.nome)}`,
          mimetype: arq.mimetype,
        });
    }
    // Depois da foto e do vídeo: valor com parcelamento (se cadastrado) e a pergunta
    const preco = config.precos[bike.pasta];
    if (preco) await mandar(jid, config.valorDaBike(bike.nome, preco));
    await mandar(jid, config.gostou);
    salvar(jid, 'gostou', { ...perfil, tentativas: 0, viu: bike.nome, viuPasta: bike.pasta });
  }

  // Com o que já sabemos do cliente, decide: perguntar, recomendar ou mandar a bike.
  // Só manda o que o cliente pediu: BMX/Free Ride só se pedir, e nunca bike do outro gênero.
  // e = o que o cliente acabou de escrever (para responder "Temos sim!" a uma pergunta)
  async function fluxoBicicleta(jid, c, perfil, e = {}) {
    const aros = perfil.aro ? [perfil.aro] : arosPara(perfil);

    if (!aros.length && !perfil.estilo) {
      if (!perfil.genero) {
        await mandar(jid, config.perguntaPerfil);
        return salvar(jid, 'perfil', perfil);
      }
      await mandar(jid, config.tabelaAros);
      return salvar(jid, 'aro', perfil);
    }

    const recomendacao = perfil.aro || perfil.recomendou || !aros.length ? '' : config.recomendacao(perfil, aros);
    const salvarRecomendou = (etapa, extra = {}) => salvar(jid, etapa, { ...perfil, ...extra, recomendou: true });

    let opcoes = catalogo().filter((b) =>
      (perfil.estilo ? b.estilo === perfil.estilo : !b.estilo) && (!aros.length || aros.includes(b.aro)));

    // Perguntou "tem aro 16?" / "tem bmx?" e temos: responde antes de seguir
    const perguntou = e.pergunta && (e.aro || e.estilo) && opcoes.length;
    const temSim = perguntou ? config.temSim(config.descrever({ estilo: e.estilo }, e.aro ? [e.aro] : [])) : '';

    // Pediu BMX/Free Ride pelo nome: manda direto, sem perguntar gênero
    if (!perfil.genero && !perfil.estilo && opcoes.some((b) => b.tipo)) {
      const vezes = perfil.vezesGenero ?? 0;
      if (vezes >= 3) return chamarAtendente(jid, c, config.naoEntendiFinal); // não fica em loop
      if (recomendacao) await mandar(jid, recomendacao);
      const pergunta = vezes ? config.perguntaGeneroDeNovo : config.perguntaGenero;
      await mandar(jid, temSim ? `${temSim} ${vezes ? 'Só preciso saber: é' : 'É'} masculina ou feminina?` : pergunta);
      return salvarRecomendou('perfil', { aro: perfil.aro ?? (aros.length === 1 ? aros[0] : undefined), vezesGenero: vezes + 1 });
    }
    if (perfil.genero) opcoes = opcoes.filter((b) => b.tipo === perfil.genero || b.tipo === null);

    if (recomendacao) await mandar(jid, recomendacao);
    if (!opcoes.length) return chamarAtendente(jid, c, config.semFotos(config.descrever(perfil, aros)));
    if (temSim) await mandar(jid, temSim);
    // Já mandou essa mesma bike: não repete foto e vídeo
    if (opcoes.length === 1 && opcoes[0].nome === perfil.viu) {
      const preco = (e.preco || e.pagamento) && config.precos[opcoes[0].pasta];
      if (preco) await mandar(jid, config.valorDaBike(opcoes[0].nome, preco));
      await mandar(jid, preco ? config.finalizar : config.mesmaBike);
      return salvar(jid, 'gostou', perfil);
    }

    // Ainda sobrou mais de um aro (adulto: 26 ou 29) → cliente escolhe
    const arosDisponiveis = [...new Set(opcoes.map((b) => b.aro))].sort((a, b) => a - b);
    if (arosDisponiveis.length > 1) {
      await mandar(jid, config.perguntaQualAro(arosDisponiveis));
      return salvarRecomendou('aro');
    }
    return enviarBicicleta(jid, opcoes[0], perfil, e);
  }

  // Histórico da conversa no formato da OpenAI. Fotos/vídeos do bot não entram como mensagem
  // (a IA copiava as anotações); a lista de bikes enviadas vai à parte, em "enviadas".
  function historicoParaIA(jid) {
    const msgs = mensagensDe(jid).slice(-30);
    const enviadas = msgs.filter((m) => m.autor === 'bot' && m.tipo === 'imagem' && m.texto).map((m) => m.texto);
    const historico = msgs.map((m) => {
      if (m.autor === 'cliente') {
        return { role: 'user', content: m.tipo === 'texto' ? m.texto : `(o cliente mandou um ${m.tipo}) ${m.texto || ''}`.trim() };
      }
      if (m.tipo !== 'texto') return null;
      return { role: 'assistant', content: m.texto };
    }).filter((m) => m && m.content);
    return { historico, enviadas: [...new Set(enviadas)] };
  }

  // Deixa a IA responder. Devolve false se a OpenAI falhar (aí seguem as regras).
  async function atenderComIA(jid, perfil, e) {
    let r;
    try {
      r = await pensar({ catalogo: catalogo(), ...historicoParaIA(jid) });
    } catch (err) {
      console.error('IA falhou, seguindo pelas regras:', err.message);
      return false;
    }
    let atendente = r.acoes.find((a) => a.nome === 'chamar_atendente');
    // Disse que vai chamar o atendente mas não acionou: aciona (senão a IA continuaria no chat).
    // Só frase afirmativa — "Quer que um atendente finalize com você?" é pergunta e não conta.
    const avisouAtendente = /vou (chamar|pedir|passar)|atendente j[aá] vai|vai te (responder|atender)/i.test(r.texto) && !/\?\s*$/.test(r.texto);
    if (!atendente && avisouAtendente) atendente = { args: { mensagem: r.texto } };
    // Trava: pedido de bicicleta antes de mostrar alguma bike não vai para o atendente — as regras assumem
    const sobreBike = (e.bicicleta || e.temPerfil) && !(e.atendente || e.pecas || e.manutencao || e.entrega || e.pagamento || e.preco);
    if (atendente && sobreBike && !lerPerfil(contato(jid)).viuPasta) {
      console.warn('IA quis chamar o atendente num pedido de bike; seguindo pelas regras');
      return false;
    }
    const pedida = r.acoes.find((a) => a.nome === 'enviar_bike');
    let bike = pedida && catalogo().find((b) => b.pasta === pedida.args.pasta);

    // Trava de gênero: bike masculina/feminina só depois que o cliente disse qual (BMX e unissex passam)
    if (bike?.tipo && !bike.estilo) {
      if (!perfil.genero) {
        const pergunta = e.aro ? `${config.temSim(`aro ${e.aro}`)} É masculina ou feminina?` : config.perguntaGenero;
        await mandar(jid, pergunta);
        salvar(jid, 'ia', { ...perfil, aro: bike.aro });
        return true;
      }
      if (bike.tipo !== perfil.genero) {
        const certa = catalogo().find((b) => b.aro === bike.aro && b.tipo === perfil.genero && !b.estilo);
        if (!certa) return chamarAtendente(jid, contato(jid), config.semFotos(config.descrever(perfil, [bike.aro]))).then(() => true);
        bike = certa;
      }
    }
    const repetida = bike && bike.pasta === lerPerfil(contato(jid)).viuPasta;
    if (repetida) bike = null;

    const limpar = (s) => String(s ?? '')
      .replace(/\[[^\]]*\]/g, '')          // nunca manda anotação entre colchetes
      .replace(/\*\*(.+?)\*\*/g, '*$1*')   // negrito do WhatsApp é *assim*
      .trim();
    const texto = limpar(r.texto);
    if (texto && !atendente) await mandar(jid, texto);
    if (repetida && !texto) await mandar(jid, config.mesmaBike);
    if (bike) await enviarBicicleta(jid, bike, perfil);
    if (atendente) await chamarAtendente(jid, contato(jid), limpar(atendente.args.mensagem) || config.atendente);
    else if (!bike) salvar(jid, repetida ? 'gostou' : 'ia', { ...lerPerfil(contato(jid)), ...perfil });
    if (!r.texto && !bike && !atendente && !repetida) console.warn('IA não respondeu nada para', jid);
    return true;
  }

  // Não entendeu: tenta de novo uma vez, na segunda chama o atendente
  async function naoEntendeu(jid, c, perfil, texto) {
    const tentativas = (perfil.tentativas ?? 0) + 1;
    if (tentativas >= 2) return chamarAtendente(jid, c, config.naoEntendiFinal);
    await mandar(jid, texto);
    salvar(jid, c.etapa, { ...perfil, tentativas });
  }

  // Uma mensagem por vez para cada contato: duas mensagens seguidas não geram duas respostas
  // em paralelo, e a segunda já vê o que foi respondido à primeira.
  const filas = new Map();
  return function processar(evento) {
    const chave = evento?.data?.key?.remoteJid || '-';
    const atual = (filas.get(chave) ?? Promise.resolve()).catch(() => {}).then(() => tratar(evento));
    filas.set(chave, atual);
    atual.finally(() => { if (filas.get(chave) === atual) filas.delete(chave); }).catch(() => {});
    return atual;
  };

  async function tratar(evento) {
    if (evento?.event !== 'messages.upsert') return;
    const d = evento.data;
    if (!d?.key || !d.message) return;

    const jid = jidDo(d.key);
    if (!jid || jid.endsWith('@g.us') || jid.includes('broadcast') || jid.endsWith('@newsletter')) return;

    // Mensagens antigas (sincronização de histórico) ficam de fora
    const ts = Number(d.messageTimestamp) * 1000;
    if (ts && Date.now() - ts > 2 * 60_000) return;

    const texto = textoDa(d.message);
    const tipo = tipoDa(d.message);

    // Boas-vindas automática do anúncio (".") e afins: ignora de vez (não pausa, não registra, não responde)
    if (tipo === 'texto' && config.ignorar.includes(texto)) return;

    const telefone = jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : null;
    garantirContato(jid, { nome: d.key.fromMe ? null : d.pushName, telefone });

    // Saiu deste WhatsApp sem ser por nós → atendente respondendo pelo celular: registra e pausa o bot
    if (d.key.fromMe) {
      if (await foiEnviadaPorNos(jid, d.key.id)) return;
      if (registrarRecebida({ waId: d.key.id, jid, autor: 'atendente', tipo, texto })) guardarMidia(d.key.id, tipo);
      const c = contato(jid);
      atualizarContato(jid, { pausado_ate: Math.max(c.pausado_ate, Date.now() + config.pausaHoras * 3600_000) });
      return;
    }

    if (registrarRecebida({ waId: d.key.id, jid, autor: 'cliente', tipo, texto })) guardarMidia(d.key.id, tipo);

    // "#teste" faz a conversa se comportar como vinda de anúncio (para testar a automação)
    const ehTeste = texto.toLowerCase() === '#teste';
    const anuncio = detectarAnuncio(d) ?? (ehTeste ? { titulo: 'Teste (#teste)' } : null);
    if (anuncio) {
      atualizarContato(jid, {
        origem: 'anuncio', anuncio_titulo: anuncio.titulo, anuncio_texto: anuncio.texto, anuncio_url: anuncio.url,
        anuncio_id: anuncio.id, ctwa_clid: anuncio.clid, anuncio_em: Date.now(),
      });
    }

    // "#teste" recomeça do zero: tira a pausa e esquece em que ponto a conversa estava
    if (ehTeste) atualizarContato(jid, { pausado_ate: 0, etapa: null, perfil: null });

    const c = contato(jid);
    if (ajuste('bot_ativo', '1') !== '1') return;
    if (config.automacao === 'anuncio' && c.origem !== 'anuncio') return;
    if (Date.now() < c.pausado_ate) return;

    const novaConversa = anuncio || !c.etapa || Date.now() - c.visto_em > config.sessaoMinutos * 60_000;
    atualizarContato(jid, { visto_em: Date.now() });

    const e = entender(ehTeste ? '' : texto);
    let perfil = novaConversa ? {} : lerPerfil(c);
    // falou um aro diferente: é informação nova, a contagem de "não respondeu o gênero" recomeça
    if (e.aro && e.aro !== perfil.aro) delete perfil.vezesGenero;
    for (const k of ['genero', 'idade', 'altura', 'aro', 'estilo']) if (e[k] != null) perfil[k] = e[k];
    // idade/altura nova vale mais que um aro escolhido antes
    if ((e.idade != null || e.altura) && !e.aro) {
      delete perfil.aro;
      delete perfil.recomendou;
    }
    // pediu outro tamanho sem falar de BMX/Free Ride → volta para as bikes comuns
    if ((e.aro || e.idade != null || e.altura) && !e.estilo) delete perfil.estilo;

    // Foto, áudio, vídeo do cliente: sem IA não dá para entender → pessoa
    if (tipo !== 'texto' && !texto) return chamarAtendente(jid, c, config.midiaDoCliente);

    if (novaConversa) {
      await mandar(jid, config.saudacao);
      const jaPediuAlgo = e.temPerfil || e.bicicleta || e.preco || e.pecas || e.manutencao || e.endereco || e.entrega || e.pagamento || e.atendente;
      if (!jaPediuAlgo) return salvar(jid, 'interesse', perfil); // "Olá, tenho interesse…": só a saudação
      if (iaAtiva() && await atenderComIA(jid, perfil, e)) return;
      // A 1ª mensagem já diz o que quer ("quero bike aro 20 pra menina")? Segue direto
      if (e.temPerfil && !e.pecas && !e.manutencao) return fluxoBicicleta(jid, contato(jid), perfil, e);
      return salvar(jid, 'interesse', perfil);
    }

    // Com a IA ligada, ela conduz a conversa; as regras abaixo ficam de reserva
    if (iaAtiva() && await atenderComIA(jid, perfil, e)) return;

    // Perguntamos se gostou do modelo: a resposta vai para o atendente,
    // a não ser que o cliente peça outro tamanho ("e o aro 24?", "tem pra 10 anos?")
    if (c.etapa === 'gostou') {
      const outroTamanho = !e.sim && (e.aro || e.estilo || e.idade != null || e.altura || AROS.includes(e.numero));
      if (outroTamanho) return fluxoBicicleta(jid, c, AROS.includes(e.numero) ? { ...perfil, aro: e.numero } : perfil, e);
      if (e.preco || e.pagamento) {
        const preco = config.precos[perfil.viuPasta];
        if (!preco) return chamarAtendente(jid, c, config.precoDaBike(perfil.viu || 'bike'));
        await mandar(jid, config.valorDaBike(perfil.viu, preco));
        await mandar(jid, config.finalizar); // segue esperando: "sim" chama o atendente
        return;
      }
      if (e.entrega) return chamarAtendente(jid, c, config.entrega);
      if (e.endereco) return mandar(jid, config.endereco); // continua esperando a resposta do "gostou?"
      if (e.atendente) return chamarAtendente(jid, c, config.atendente);
      if (e.sim) return chamarAtendente(jid, c, config.interesse);
      if (e.nao) return chamarAtendente(jid, c, config.outrosModelos);
      return chamarAtendente(jid, c, config.atendente); // resposta que o bot não entende: passa sem supor nada
    }

    // Intenções que valem em qualquer etapa
    if (e.atendente) return chamarAtendente(jid, c, config.atendente);
    if (e.manutencao && !e.temPerfil) return chamarAtendente(jid, c, config.manutencao);
    if (e.pecas && !e.bicicleta && !e.temPerfil) return chamarAtendente(jid, c, config.pecas);
    if (e.temPerfil) return fluxoBicicleta(jid, c, perfil, e);
    if (e.endereco) return mandar(jid, config.endereco);
    if (e.pagamento) return mandar(jid, config.pagamento);
    if (e.preco) return chamarAtendente(jid, c, config.preco);
    if (e.entrega) return chamarAtendente(jid, c, config.entrega);

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

      default:
        return naoEntendeu(jid, c, perfil, config.naoEntendi);
    }
  };
}
