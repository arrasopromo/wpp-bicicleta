// Recebe os eventos do webhook: registra tudo no CRM e roda a automação
// (por padrão só para quem chegou por anúncio).
import { config } from '../config.js';
import { enviarTexto, enviarMidia, idsEnviados } from './evolution.js';
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

export function criarBot({ catalogo, publicUrl }) {
  const listaAros = () => catalogo().map((b, i) => `*${i + 1}* - ${b.nome}`).join('\n');
  const mandar = (jid, texto) => enviarTextoComo(jid, 'bot', texto);

  async function mostrarMenu(jid, saudacao) {
    await mandar(jid, saudacao ? `${saudacao}\n\n${config.menu}` : config.menu);
    atualizarContato(jid, { etapa: 'menu' });
  }

  async function enviarBicicleta(jid, bike) {
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
    atualizarContato(jid, { etapa: 'pos-fotos' });
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
    const anuncio = detectarAnuncio(d) ?? (texto.toLowerCase() === '#teste' ? { titulo: 'Teste (#teste)' } : null);
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

    if (novaConversa) {
      const saudacao = c.origem === 'anuncio'
        ? config.saudacaoAnuncio(d.pushName, c.anuncio_titulo)
        : config.saudacao(d.pushName);
      return mostrarMenu(jid, saudacao);
    }
    if (texto === '0') return mostrarMenu(jid);

    if (c.etapa === 'aro') {
      const bike = catalogo()[Number(texto) - 1];
      if (/^\d+$/.test(texto) && bike) return enviarBicicleta(jid, bike);
      return mandar(jid, `${config.naoEntendi}\n\n${config.escolhaAro(listaAros())}`);
    }

    switch (texto) {
      case '1':
        atualizarContato(jid, { etapa: 'aro' });
        return mandar(jid, config.escolhaAro(listaAros()));
      case '2':
        return mandar(jid, `${config.endereco}\n\n*0* - Voltar ao menu`);
      case '3':
        return mandar(jid, `${config.pagamento}\n\n*0* - Voltar ao menu`);
      case '4':
        await mandar(jid, config.atendente);
        atualizarContato(jid, {
          etapa: null,
          status: c.status === 'novo' ? 'em atendimento' : c.status,
          pausado_ate: Date.now() + config.pausaHoras * 3600_000,
        });
        return;
      default:
        return mandar(jid, `${config.naoEntendi}\n\n${config.menu}`);
    }
  };
}
