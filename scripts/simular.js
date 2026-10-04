// Simula conversas sem mandar nada de verdade (DRY_RUN, banco em memória): npm run testar
process.env.DRY_RUN = '1';
process.env.DB_PATH = ':memory:';
const { resolve } = await import('node:path');
const { carregarCatalogo } = await import('../src/catalogo.js');
const { criarBot } = await import('../src/bot.js');
const { contato, mensagensDe } = await import('../src/db.js');

const dados = carregarCatalogo(resolve(process.env.MEDIA_DIR || './midia'));
const bot = criarBot({ catalogo: () => dados, publicUrl: process.env.PUBLIC_URL });

const msg = (numero, texto, { anuncio = false, fromMe = false } = {}) => ({
  event: 'messages.upsert',
  data: {
    key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe, id: Math.random().toString(36).slice(2) },
    pushName: fromMe ? 'Loja' : 'Cliente Teste',
    message: anuncio
      ? { extendedTextMessage: { text: texto, contextInfo: { externalAdReply: {
          title: 'Bike Aro 29 em promoção', body: 'Chama no WhatsApp', sourceType: 'ad', sourceId: '1202', ctwaClid: 'abc' } } } }
      : { conversation: texto },
    messageTimestamp: Math.floor(Date.now() / 1000),
  },
});

async function passo(rotulo, evento) {
  console.log(`\n>>> ${rotulo}`);
  await bot(evento);
}

const ORG = '5531911110000';
const ADS = '5531922220000';

await passo('orgânico: "oi" (deve só registrar, sem resposta)', msg(ORG, 'oi'));
await passo('anúncio: "Olá, vi o anúncio" (deve saudar citando o anúncio)', msg(ADS, 'Olá, vi o anúncio', { anuncio: true }));
await passo('anúncio: "2"', msg(ADS, '2'));
await passo('atendente responde pelo celular (deve pausar o bot)', msg(ADS, 'Oi! Sou o Pedro, posso ajudar?', { fromMe: true }));
await passo('anúncio: "1" (bot pausado, sem resposta)', msg(ADS, '1'));

for (const n of [ORG, ADS]) {
  const c = contato(`${n}@s.whatsapp.net`);
  console.log(`\n[CRM] ${n}: origem=${c.origem} anuncio="${c.anuncio_titulo ?? ''}" pausado=${c.pausado_ate > Date.now()} naoLidas=${c.nao_lidas}`);
  for (const m of mensagensDe(c.jid)) console.log(`   ${m.autor.padEnd(9)} ${m.texto.replace(/\n/g, ' ').slice(0, 70)}`);
}
