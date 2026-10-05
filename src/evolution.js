// Cliente mínimo da Evolution API v2.
const { EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_INSTANCE, DRY_RUN } = process.env;

// IDs das mensagens que nós mandamos — para não confundir com o atendente digitando no celular
export const idsEnviados = new Set();

async function chamar(caminho, corpo) {
  if (DRY_RUN) {
    console.log('[DRY_RUN]', caminho, JSON.stringify(corpo));
    return { key: { id: `dry-${Date.now()}-${Math.random().toString(36).slice(2)}` } };
  }
  const res = await fetch(`${EVOLUTION_URL}${caminho}/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    body: JSON.stringify(corpo),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Evolution ${caminho} ${res.status}: ${JSON.stringify(json)}`);
  if (json?.key?.id) {
    idsEnviados.add(json.key.id);
    if (idsEnviados.size > 5000) idsEnviados.delete(idsEnviados.values().next().value);
  }
  return json;
}

// "digitando…" antes de enviar, proporcional ao tamanho do texto (1,5 s a 5 s)
const tempoDigitando = (texto) => Math.min(5000, Math.max(1500, 1000 + String(texto).length * 15));

// quoted (opcional) = resposta citada: { key: { id, remoteJid, fromMe }, message: { conversation } }
export const enviarTexto = (numero, text, quoted) =>
  chamar('/message/sendText', { number: numero, text, delay: tempoDigitando(text), ...(quoted && { quoted }) });

export const enviarMidia = (numero, { tipo, url, mimetype, fileName, caption, quoted }) =>
  chamar('/message/sendMedia', { number: numero, mediatype: tipo, mimetype, media: url, fileName, caption, delay: 1200, ...(quoted && { quoted }) });

// Mensagem de voz (a Evolution converte o áudio para o formato do WhatsApp)
export const enviarAudio = (numero, url) =>
  chamar('/message/sendWhatsAppAudio', { number: numero, audio: url, encoding: true });

// Baixa a mídia de uma mensagem recebida: { base64, mimetype }
export async function baixarMidia(waId) {
  if (DRY_RUN) return null;
  const res = await fetch(`${EVOLUTION_URL}/chat/getBase64FromMediaMessage/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY },
    body: JSON.stringify({ message: { key: { id: waId } }, convertToMp4: false }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.base64) throw new Error(`Evolution getBase64 ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return { base64: json.base64, mimetype: json.mimetype };
}
