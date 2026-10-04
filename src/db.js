// Banco do CRM (SQLite embutido no Node): contatos, mensagens e ajustes.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const destino = process.env.DB_PATH || './dados/crm.db';
const caminho = destino === ':memory:' ? destino : resolve(destino);
if (caminho !== ':memory:') mkdirSync(dirname(caminho), { recursive: true });

export const db = new DatabaseSync(caminho);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS contatos (
    jid TEXT PRIMARY KEY,
    nome TEXT,
    telefone TEXT,
    origem TEXT NOT NULL DEFAULT 'organico',
    anuncio_titulo TEXT, anuncio_texto TEXT, anuncio_url TEXT, anuncio_id TEXT, ctwa_clid TEXT, anuncio_em INTEGER,
    status TEXT NOT NULL DEFAULT 'novo',
    notas TEXT NOT NULL DEFAULT '',
    etapa TEXT,
    visto_em INTEGER NOT NULL DEFAULT 0,
    pausado_ate INTEGER NOT NULL DEFAULT 0,
    nao_lidas INTEGER NOT NULL DEFAULT 0,
    ultima_msg TEXT,
    ultima_msg_em INTEGER NOT NULL DEFAULT 0,
    criado_em INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS mensagens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id TEXT UNIQUE,
    jid TEXT NOT NULL,
    autor TEXT NOT NULL,          -- cliente | bot | atendente
    tipo TEXT NOT NULL,
    texto TEXT,
    criado_em INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mensagens_jid ON mensagens (jid, criado_em);
  CREATE TABLE IF NOT EXISTS ajustes (chave TEXT PRIMARY KEY, valor TEXT);
`);

// Pausa pelo botão: dura até alguém clicar em "Retomar"
export const PAUSA_MANUAL = 253402300799000;

export const STATUS = ['novo', 'em atendimento', 'aguardando cliente', 'vendido', 'perdido'];

const CAMPOS = new Set([
  'nome', 'origem', 'anuncio_titulo', 'anuncio_texto', 'anuncio_url', 'anuncio_id', 'ctwa_clid', 'anuncio_em',
  'status', 'notas', 'etapa', 'visto_em', 'pausado_ate', 'nao_lidas',
]);

export const contato = (jid) => db.prepare('SELECT * FROM contatos WHERE jid = ?').get(jid);

export function garantirContato(jid, { nome, telefone } = {}) {
  db.prepare('INSERT OR IGNORE INTO contatos (jid, telefone, criado_em) VALUES (?, ?, ?)').run(jid, telefone ?? null, Date.now());
  if (nome) db.prepare('UPDATE contatos SET nome = ? WHERE jid = ?').run(nome, jid);
  return contato(jid);
}

export function atualizarContato(jid, campos) {
  const chaves = Object.keys(campos).filter((k) => CAMPOS.has(k));
  if (!chaves.length) return;
  db.prepare(`UPDATE contatos SET ${chaves.map((k) => `${k} = ?`).join(', ')} WHERE jid = ?`)
    .run(...chaves.map((k) => campos[k] ?? null), jid);
}

function tocarContato(jid, autor, texto, em) {
  db.prepare(`UPDATE contatos SET ultima_msg = ?, ultima_msg_em = ?, nao_lidas = nao_lidas + ? WHERE jid = ?`)
    .run(texto?.slice(0, 200) ?? '', em, autor === 'cliente' ? 1 : 0, jid);
}

// Mensagem que chegou pelo webhook (não sobrescreve se já existir)
export function registrarRecebida({ waId, jid, autor, tipo, texto }) {
  const em = Date.now();
  const r = db.prepare('INSERT OR IGNORE INTO mensagens (wa_id, jid, autor, tipo, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?)')
    .run(waId ?? null, jid, autor, tipo, texto ?? '', em);
  if (r.changes) tocarContato(jid, autor, texto, em);
}

// Mensagem enviada por nós: o autor daqui é o correto, mesmo se o webhook chegou antes
export function registrarEnviada({ waId, jid, autor, tipo, texto }) {
  const em = Date.now();
  db.prepare(`INSERT INTO mensagens (wa_id, jid, autor, tipo, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (wa_id) DO UPDATE SET autor = excluded.autor`)
    .run(waId ?? null, jid, autor, tipo, texto ?? '', em);
  tocarContato(jid, autor, texto, em);
}

export function listarConversas({ filtro = 'todas', busca = '' } = {}) {
  const onde = [];
  const args = [];
  if (filtro === 'anuncio') onde.push(`origem = 'anuncio'`);
  if (filtro === 'organico') onde.push(`origem = 'organico'`);
  if (filtro === 'pausado') {
    onde.push('pausado_ate > ?');
    args.push(Date.now());
  }
  if (filtro === 'nao_lidas') onde.push('nao_lidas > 0');
  if (busca) {
    onde.push('(nome LIKE ? OR telefone LIKE ? OR anuncio_titulo LIKE ?)');
    args.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
  }
  return db.prepare(`SELECT * FROM contatos ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
                     ORDER BY ultima_msg_em DESC LIMIT 300`).all(...args);
}

export const mensagensDe = (jid) =>
  db.prepare('SELECT * FROM (SELECT * FROM mensagens WHERE jid = ? ORDER BY id DESC LIMIT 500) ORDER BY id').all(jid);

export const ajuste = (chave, padrao) => db.prepare('SELECT valor FROM ajustes WHERE chave = ?').get(chave)?.valor ?? padrao;
export const salvarAjuste = (chave, valor) =>
  db.prepare('INSERT INTO ajustes (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor').run(chave, String(valor));
