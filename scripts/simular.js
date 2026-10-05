// Simula conversas sem mandar nada de verdade (DRY_RUN, banco em memória): npm run testar
process.env.DRY_RUN = '1';
process.env.DB_PATH = ':memory:';
process.env.OPENAI_API_KEY = ''; // testa as regras (a IA tem o próprio teste: npm run testar-ia)
const { resolve } = await import('node:path');
const { carregarCatalogo } = await import('../src/catalogo.js');
const { criarBot } = await import('../src/bot.js');
const { contato } = await import('../src/db.js');

const dados = carregarCatalogo(resolve(process.env.MEDIA_DIR || './midia'));
const bot = criarBot({ catalogo: () => dados, publicUrl: 'https://exemplo' });

// Mostra só o que o cliente veria, resumindo as mídias
const logOriginal = console.log;
let midias = 0;
console.log = (...a) => {
  if (a[0] !== '[DRY_RUN]') return logOriginal(...a);
  const corpo = JSON.parse(a[2]);
  if (a[1].includes('sendMedia')) {
    return logOriginal(`   🤖 [${corpo.mediatype === 'video' ? 'vídeo' : 'foto'}] ${decodeURIComponent(corpo.media.split('/midia/')[1])}${corpo.caption ? `  legenda: ${corpo.caption}` : ''}`);
  }
  logOriginal('   🤖 ' + corpo.text.replace(/\n+/g, '\n      '));
};

let n = 0;
const msg = (numero, texto, { anuncio = false } = {}) => ({
  event: 'messages.upsert',
  data: {
    key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: false, id: `m${n++}` },
    pushName: 'Cliente',
    message: anuncio
      ? { extendedTextMessage: { text: texto, contextInfo: { externalAdReply: { title: 'Bikes infantis', sourceType: 'ad', sourceId: '1' } } } }
      : { conversation: texto },
    messageTimestamp: Math.floor(Date.now() / 1000),
  },
});

async function conversa(titulo, numero, falas) {
  logOriginal(`\n══════ ${titulo} ══════`);
  for (const [i, f] of falas.entries()) {
    logOriginal(`👤 ${f}`);
    await bot(msg(numero, f, { anuncio: i === 0 }));
    if (midias) { logOriginal(`   🤖 [${midias} fotos/vídeos]`); midias = 0; }
  }
  const c = contato(`${numero}@s.whatsapp.net`);
  logOriginal(`   (etapa=${c.etapa} perfil=${c.perfil} pausado=${c.pausado_ate > Date.now()})`);
}

await conversa('Raynan: outro aro e depois valor', '5531900000022', ['oi', 'bike aro 20 menina', 'e aro 16, tem?', 'quais os valores?']);
await conversa('Preço junto com o pedido', '5531900000025', ['oi', 'quanto custa a aro 24 menina?', 'sim']);
await conversa('Preço sem cadastro (aro 29)', '5531900000026', ['oi', 'aro 29', 'qual o valor?']);
await conversa('Depois do gostou: resposta qualquer', '5531900000023', ['oi', 'aro 12 menino', 'meu filho tem 2 anos e meio']);
await conversa('Depois do gostou: não gostei', '5531900000024', ['oi', 'aro 12 menino', 'nao gostei muito']);
await conversa('Print do cliente: pergunta aro 16', '5531900000020', ['Olá, tenho interesse e gostaria de mais informações', 'bicicleta para criança de 2 anos', 'tem aro 16? acho que e melhor', 'nao entendi, voce tem aro 16 ou nao', 'menina']);
await conversa('Ignora o gênero 3x', '5531900000021', ['oi', 'tem aro 20?', 'quanto tempo demora a entrega', 'hmm']);
await conversa('Roteiro da loja', '5531900000001', ['Olá, vi o anúncio', 'bicicleta', 'menina de 8 anos', 'sim, gostei!']);
await conversa('Quer aro 20 direto, não gostou', '5531900000011', ['oi', 'quero aro 20 masculina', 'não muito']);
await conversa('Aro sem gênero', '5531900000013', ['oi', 'tem aro 20?', 'feminina']);
await conversa('Pede BMX', '5531900000014', ['oi', 'vocês tem bmx?']);
await conversa('Pede free ride', '5531900000015', ['oi', 'quero ver a free ride']);
await conversa('Mulher pede free ride', '5531900000016', ['oi', 'free ride feminina']);
await conversa('Mulher aro 26 (sem fotos)', '5531900000017', ['oi', 'bike aro 26 feminina']);
await conversa('Tudo numa frase, gostou', '5531900000002', ['Oi', 'quero uma bike pro meu filho de 4 anos', 'gostei, é pro meu filho mesmo']);
await conversa('Pede outro aro depois', '5531900000012', ['oi', 'bike aro 24 menino', 'e a aro 26?']);
await conversa('Por altura', '5531900000003', ['Boa tarde', 'bicicleta para minha esposa, ela tem 1,55']);
await conversa('Só gênero, depois aro', '5531900000004', ['oi', 'bike masculina', '29']);
await conversa('Adulto sem gênero', '5531900000005', ['olá', 'bike pra adulto', 'masculina', '29']);
await conversa('Pergunta endereço no meio', '5531900000006', ['oi', 'onde fica a loja?', 'bicicleta aro 12 menino']);
await conversa('Manutenção', '5531900000007', ['oi', 'preciso arrumar o freio da minha bike']);
await conversa('Peças', '5531900000008', ['oi', 'vocês tem capacete?']);
await conversa('Preço direto', '5531900000009', ['oi', 'quanto custa?']);
await conversa('Não entende 2x', '5531900000010', ['oi', 'asdf', 'hmm']);
