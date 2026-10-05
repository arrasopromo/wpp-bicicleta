// Arquivos de mídia das conversas.
//  - recebidos: o que o cliente (ou o atendente pelo celular) mandou → só abre logado no CRM (/crm/midia/...)
//  - enviados: o que mandamos pelo painel → link público com nome aleatório, porque a Evolution precisa baixar (/arquivos/...)
import { createReadStream, createWriteStream, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const base = resolve(dirname(process.env.DB_PATH && process.env.DB_PATH !== ':memory:' ? process.env.DB_PATH : './dados/crm.db'));
export const DIR_RECEBIDOS = join(base, 'midias');
export const DIR_ENVIADOS = join(base, 'enviados');
mkdirSync(DIR_RECEBIDOS, { recursive: true });
mkdirSync(DIR_ENVIADOS, { recursive: true });

const EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/webm': 'webm', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a',
  'application/pdf': 'pdf',
};
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

const limparMime = (m) => String(m || '').split(';')[0].trim().toLowerCase();
export const extDe = (mimetype) => EXT[limparMime(mimetype)] ?? 'bin';
const novoNome = (mimetype) => `${Date.now().toString(36)}-${randomBytes(12).toString('hex')}.${extDe(mimetype)}`;

// "imagem" | "video" | "audio" | "documento" pelo mimetype
export function tipoPorMime(mimetype) {
  const m = limparMime(mimetype);
  if (m.startsWith('image/')) return 'imagem';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'documento';
}

export function salvarBase64(dir, base64, mimetype) {
  const nome = novoNome(mimetype);
  writeFileSync(join(dir, nome), Buffer.from(base64, 'base64'));
  return nome;
}

// Grava o corpo da requisição direto no disco, com limite de tamanho
export function salvarUpload(req, dir, mimetype, limiteBytes) {
  return new Promise((ok, erro) => {
    const nome = novoNome(mimetype);
    const caminho = join(dir, nome);
    const out = createWriteStream(caminho);
    let tam = 0;
    const falhar = (e) => { out.destroy(); try { unlinkSync(caminho); } catch {} erro(e); };
    req.on('data', (c) => {
      tam += c.length;
      if (tam > limiteBytes) { req.destroy(); falhar(new Error(`arquivo maior que ${Math.round(limiteBytes / 1048576)} MB`)); }
    });
    req.on('error', falhar);
    req.pipe(out);
    out.on('finish', () => (tam ? ok(nome) : falhar(new Error('arquivo vazio'))));
    out.on('error', falhar);
  });
}

// Serve um arquivo com suporte a Range (vídeo e áudio precisam para avançar/voltar, e o Safari exige)
export function servirArquivo(req, res, dir, nome) {
  if (!/^[\w.-]+$/.test(nome || '')) return res.writeHead(404).end();
  const caminho = join(dir, nome);
  let info;
  try { info = statSync(caminho); } catch { return res.writeHead(404).end(); }
  const tipo = MIME[nome.split('.').pop()] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const cab = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400' };
  if (range) {
    const ini = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const fim = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (ini >= info.size || ini > fim) return res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
    res.writeHead(206, { ...cab, 'Content-Range': `bytes ${ini}-${fim}/${info.size}`, 'Content-Length': fim - ini + 1 });
    return createReadStream(caminho, { start: ini, end: fim }).pipe(res);
  }
  res.writeHead(200, { ...cab, 'Content-Length': info.size });
  createReadStream(caminho).pipe(res);
}
