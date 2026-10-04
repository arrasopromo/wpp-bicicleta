// Cadastra (ou atualiza) o webhook da instância na Evolution API.
// Uso: npm run webhook
const { EVOLUTION_URL, EVOLUTION_APIKEY, EVOLUTION_INSTANCE, PUBLIC_URL, WEBHOOK_TOKEN } = process.env;
const base = `${EVOLUTION_URL}/webhook`;
const inst = encodeURIComponent(EVOLUTION_INSTANCE);
const headers = { 'Content-Type': 'application/json', apikey: EVOLUTION_APIKEY };

const url = `${PUBLIC_URL.replace(/\/$/, '')}/webhook/${WEBHOOK_TOKEN}`;

const res = await fetch(`${base}/set/${inst}`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
  }),
});
console.log('set:', res.status, await res.text());

const conf = await fetch(`${base}/find/${inst}`, { headers }).then((r) => r.json());
console.log('cadastrado:', JSON.stringify({ enabled: conf?.enabled, url: conf?.url, events: conf?.events }));
