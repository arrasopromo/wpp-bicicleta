// Servidor HTTP: webhook da Evolution, mídias do catálogo e painel CRM.
import { createServer } from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { carregarCatalogo, mimeDe } from './src/catalogo.js';
import { criarBot, enviarTextoComo, enviarArquivoComo } from './src/bot.js';
import { DIR_RECEBIDOS, DIR_ENVIADOS, salvarUpload, servirArquivo } from './src/arquivos.js';
import {
  listarConversas, mensagensDe, contato, atualizarContato, ajuste, salvarAjuste, STATUS, PAUSA_MANUAL, atendenteRespondeu,
} from './src/db.js';
import { config } from './config.js';

const { PORT = 5000, PUBLIC_URL, WEBHOOK_TOKEN, CRM_SENHA, MEDIA_DIR = './midia' } = process.env;
for (const v of ['EVOLUTION_URL', 'EVOLUTION_APIKEY', 'EVOLUTION_INSTANCE', 'PUBLIC_URL', 'WEBHOOK_TOKEN', 'CRM_SENHA']) {
  if (!process.env[v]) throw new Error(`Falta ${v} no .env`);
}

const pastaMidia = resolve(MEDIA_DIR);
const LIMITE_UPLOAD = 64 * 1048576; // o nginx precisa aceitar pelo menos isso (client_max_body_size)
// Relê o catálogo a cada minuto, então dá para adicionar fotos sem reiniciar
let cache = { em: 0, dados: [] };
const catalogo = () => {
  if (Date.now() - cache.em > 60_000) cache = { em: Date.now(), dados: carregarCatalogo(pastaMidia) };
  return cache.dados;
};

const processar = criarBot({ catalogo, publicUrl: PUBLIC_URL.replace(/\/$/, '') });

const paginaCrm = readFileSync(new URL('./public/crm.html', import.meta.url));
const paginaLogin = readFileSync(new URL('./public/login.html', import.meta.url));

// --- autenticação do painel: cookie com HMAC da senha ---
const tokenCrm = createHmac('sha256', CRM_SENHA).update('crm-casa-bicicletas').digest('hex');
function logado(req) {
  const c = /(?:^|;\s*)crm=([a-f0-9]{64})/.exec(req.headers.cookie || '')?.[1];
  return !!c && timingSafeEqual(Buffer.from(c), Buffer.from(tokenCrm));
}
function senhaConfere(senha) {
  const a = createHmac('sha256', 'x').update(String(senha ?? '')).digest();
  const b = createHmac('sha256', 'x').update(CRM_SENHA).digest();
  return timingSafeEqual(a, b);
}

function lerCorpo(req, limite = 5 * 1048576) {
  return new Promise((ok, erro) => {
    let tam = 0;
    const partes = [];
    req.on('data', (c) => {
      tam += c.length;
      if (tam > limite) req.destroy();
      else partes.push(c);
    });
    req.on('end', () => ok(Buffer.concat(partes).toString('utf8')));
    req.on('error', erro);
  });
}
const lerJson = async (req) => { try { return JSON.parse(await lerCorpo(req, 100_000)); } catch { return {}; } };

const json = (res, dados, status = 200) =>
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    .end(JSON.stringify(dados));
const html = (res, conteudo) =>
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(conteudo);

function servirMidia(res, caminho) {
  let arquivo;
  try { arquivo = resolve(pastaMidia, decodeURIComponent(caminho)); } catch { return res.writeHead(404).end(); }
  if (!arquivo.startsWith(pastaMidia + sep) || !mimeDe(arquivo)) return res.writeHead(404).end();
  let info;
  try { info = statSync(arquivo); } catch { return res.writeHead(404).end(); }
  res.writeHead(200, { 'Content-Type': mimeDe(arquivo), 'Content-Length': info.size });
  createReadStream(arquivo).pipe(res);
}

async function apiCrm(req, res, caminho) {
  if (caminho === 'estado') {
    if (req.method === 'POST') salvarAjuste('bot_ativo', (await lerJson(req)).ativo ? '1' : '0');
    return json(res, { botAtivo: ajuste('bot_ativo', '1') === '1', automacao: config.automacao, status: STATUS });
  }

  if (caminho === 'conversas' && req.method === 'GET') {
    const u = new URL(req.url, 'http://x');
    return json(res, listarConversas({
      filtro: u.searchParams.get('filtro') || 'todas',
      busca: u.searchParams.get('q') || '',
      status: u.searchParams.get('status') || '',
    }));
  }

  const m = /^conversas\/([^/]+)(?:\/(\w+))?$/.exec(caminho);
  if (!m) return json(res, { erro: 'não encontrado' }, 404);
  const jid = decodeURIComponent(m[1]);
  const acao = m[2];
  if (!contato(jid)) return json(res, { erro: 'conversa não encontrada' }, 404);

  if (!acao && req.method === 'GET') {
    atualizarContato(jid, { nao_lidas: 0 });
    return json(res, { contato: contato(jid), mensagens: mensagensDe(jid) });
  }
  if (req.method !== 'POST') return json(res, { erro: 'método' }, 405);

  // Foto/vídeo/áudio/documento pelo painel: o corpo é o próprio arquivo
  if (acao === 'arquivo') {
    const u = new URL(req.url, 'http://x');
    const mimetype = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
    let nome;
    try {
      nome = await salvarUpload(req, DIR_ENVIADOS, mimetype, LIMITE_UPLOAD);
    } catch (e) {
      return json(res, { erro: e.message }, 413);
    }
    try {
      await enviarArquivoComo(jid, 'atendente', {
        url: `${PUBLIC_URL.replace(/\/$/, '')}/arquivos/${nome}`,
        mimetype,
        nomeOriginal: (u.searchParams.get('nome') || nome).slice(0, 120),
        legenda: (u.searchParams.get('legenda') || '').slice(0, 1000),
        responderA: u.searchParams.get('responder') || undefined,
      });
    } catch (e) {
      return json(res, { erro: `não enviou: ${e.message}` }, 502);
    }
    atendenteRespondeu(jid, config.pausaHoras * 3600_000);
    return json(res, { contato: contato(jid) });
  }

  const corpo = await lerJson(req);

  if (acao === 'pausar') {
    atualizarContato(jid, { pausado_ate: corpo.pausado ? PAUSA_MANUAL : 0, ...(corpo.pausado ? {} : { etapa: null }) });
  } else if (acao === 'status' && STATUS.includes(corpo.status)) {
    atualizarContato(jid, { status: corpo.status });
  } else if (acao === 'enviar') {
    const texto = String(corpo.texto ?? '').trim();
    if (!texto) return json(res, { erro: 'mensagem vazia' }, 400);
    try {
      await enviarTextoComo(jid, 'atendente', texto, corpo.responder ? String(corpo.responder) : undefined);
    } catch (e) {
      return json(res, { erro: `não enviou: ${e.message}` }, 502);
    }
    // Atendente assumiu: bot fica calado com esse cliente
    atendenteRespondeu(jid, config.pausaHoras * 3600_000);
  } else {
    return json(res, { erro: 'ação inválida' }, 400);
  }
  return json(res, { contato: contato(jid) });
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    if (req.method === 'POST' && p === `/webhook/${WEBHOOK_TOKEN}`) {
      const corpo = await lerCorpo(req).catch(() => '');
      res.writeHead(200).end('ok'); // responde já; a Evolution não precisa esperar o bot
      let evento;
      try { evento = JSON.parse(corpo); } catch { return; }
      processar(evento).catch((e) => console.error('erro no bot:', e.message));
      return;
    }

    if (req.method === 'GET' && p.startsWith('/midia/')) return servirMidia(res, p.slice('/midia/'.length));
    // Enviados pelo painel: públicos (nome aleatório) porque a Evolution baixa daqui
    if (req.method === 'GET' && p.startsWith('/arquivos/')) return servirArquivo(req, res, DIR_ENVIADOS, p.slice('/arquivos/'.length));

    if (p === '/crm/login' && req.method === 'POST') {
      const { senha } = await lerJson(req);
      if (!senhaConfere(senha)) return json(res, { erro: 'Senha incorreta' }, 401);
      res.setHeader('Set-Cookie', `crm=${tokenCrm}; Path=/crm; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}${PUBLIC_URL.startsWith('https') ? '; Secure' : ''}`);
      return json(res, { ok: true });
    }
    if (p === '/crm/sair') {
      res.setHeader('Set-Cookie', 'crm=; Path=/crm; Max-Age=0');
      return res.writeHead(302, { Location: '/crm' }).end();
    }
    if (p === '/crm' || p === '/crm/') return html(res, logado(req) ? paginaCrm : paginaLogin);
    if (req.method === 'GET' && p.startsWith('/crm/midia/')) {
      if (!logado(req)) return res.writeHead(401).end();
      return servirArquivo(req, res, DIR_RECEBIDOS, p.slice('/crm/midia/'.length));
    }
    if (p.startsWith('/crm/api/')) {
      if (!logado(req)) return json(res, { erro: 'faça login' }, 401);
      return await apiCrm(req, res, p.slice('/crm/api/'.length));
    }

    if (req.method === 'GET' && p === '/') {
      return res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end(`wpp-bicicleta ok — ${catalogo().length} bicicletas no catálogo`);
    }

    res.writeHead(404).end();
  } catch (e) {
    console.error('erro:', e);
    if (!res.headersSent) json(res, { erro: 'erro interno' }, 500);
  }
}).listen(PORT, () => {
  console.log(`wpp-bicicleta rodando na porta ${PORT} — painel em ${PUBLIC_URL}/crm`);
  console.log(`catálogo: ${catalogo().map((b) => `${b.nome} (${b.arquivos.length})`).join(', ')}`);
});
