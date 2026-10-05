// Conversas com a IA de verdade (OpenAI), sem mandar nada no WhatsApp (DRY_RUN): npm run testar-ia
process.env.DRY_RUN = '1';
process.env.DB_PATH = ':memory:';
if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY no .env');
const { resolve } = await import('node:path');
const { carregarCatalogo } = await import('../src/catalogo.js');
const { criarBot } = await import('../src/bot.js');
const { contato } = await import('../src/db.js');

const dados = carregarCatalogo(resolve(process.env.MEDIA_DIR || './midia'));
const bot = criarBot({ catalogo: () => dados, publicUrl: 'https://exemplo' });

const logOriginal = console.log;
console.log = (...a) => {
  if (a[0] !== '[DRY_RUN]') return logOriginal(...a);
  const corpo = JSON.parse(a[2]);
  if (a[1].includes('sendMedia')) return logOriginal(`   🤖 [${corpo.mediatype === 'video' ? 'vídeo' : 'foto'}] ${decodeURIComponent(corpo.media.split('/midia/')[1])}`);
  logOriginal('   🤖 ' + corpo.text.replace(/\n+/g, '\n      '));
};

let n = 0;
async function conversa(titulo, falas) {
  const numero = `55319${String(++n).padStart(8, '0')}`;
  logOriginal(`\n══════ ${titulo} ══════`);
  for (const [i, f] of falas.entries()) {
    // "LOJA: texto" = mensagem que sai do celular da loja (ex.: outro robô)
    const daLoja = f.startsWith('LOJA: ');
    logOriginal(daLoja ? `🏪 ${f.slice(6)}` : `👤 ${f}`);
    await bot({
      event: 'messages.upsert',
      data: {
        key: { remoteJid: `${numero}@s.whatsapp.net`, fromMe: daLoja, id: `ia${n}-${i}` },
        pushName: 'Cliente',
        message: i === 0
          ? { extendedTextMessage: { text: f, contextInfo: { externalAdReply: { title: 'Teste', sourceType: 'ad', sourceId: '1' } } } }
          : { conversation: daLoja ? f.slice(6) : f },
        messageTimestamp: Math.floor(Date.now() / 1000),
      },
    });
  }
  const c = contato(`${numero}@s.whatsapp.net`);
  logOriginal(`   (pausado=${c.pausado_ate > Date.now()} status=${c.status})`);
}

const roteiros = {
  raynan: ['Olá, tenho interesse e gostaria de mais informações', 'bike aro 20 menina', 'e aro 16, tem?', 'quais os valores?', 'sim'],
  conversa: ['Olá, tenho interesse e gostaria de mais informações', 'queria uma bicicleta pro meu sobrinho', 'ele tem uns 7 anos, é bem alto pra idade', 'gostei, quero essa'],
  duvidas: ['Olá, tenho interesse e gostaria de mais informações', 'vcs ficam aonde? abre sabado?', 'tem bike pra adulto? eu tenho 1,75', 'aro 29'],
  fora: ['Olá, tenho interesse e gostaria de mais informações', 'vocês fazem entrega em BH?'],
  semgenero: ['Olá, tenho interesse e gostaria de mais informações', 'bicicleta aro 16', 'menina'],
  semgenero2: ['Olá, tenho interesse e gostaria de mais informações', 'bicicleta aro 20', 'é pro meu filho'],
  aro29: ['Olá, tenho interesse e gostaria de mais informações', 'tem aro 29?', 'feminina'],
  aro29m: ['Olá, tenho interesse e gostaria de mais informações', 'bike pra mim, tenho 1,80', 'masculina'],
  junia: ['Olá, tenho interesse e gostaria de mais informações', 'Olá! Eu procuro uma bicicleta para criança de 9 anos. Não tenho certeza do aro.', 'Feminina, mas a criança gosta de personagens masculinos também'],
  carlos: ['Olá, tenho interesse e gostaria de mais informações', 'Bom dia', 'Quanto tá saindo uma bicicleta pra criança de cinco anos'],
  italo: ['Olá, tenho interesse e gostaria de mais informações', 'Bom dia', 'LOJA: **Casa das Bicicletas**\n\n🚲 Bicicletas, 🛠️ Oficina Bike, ⚙️ Peças Bike\n\n🌐 https://rebrand.ly/casa_das_bicicletas\nwhatauto.ai', 'Queria uma bicicleta para menino de 7 anos'],
  tereza: ['Olá, tenho interesse e gostaria de mais informações', 'Bom dia tudo bem Onde fica o seu endereço da sua fábrica de bicicleta aro 20 tá quanto', 'É aro 20 é masculino'],
  depois: ['Olá, tenho interesse e gostaria de mais informações', 'aro 20 menino', 'vocês abrem domingo?', 'tem essa na cor azul?', 'oi?'],
};
const escolha = process.argv[2];
for (const [nome, falas] of Object.entries(roteiros)) if (!escolha || escolha === nome) await conversa(nome, falas);
