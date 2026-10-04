// Textos do bot. Edite à vontade — *negrito* e _itálico_ funcionam no WhatsApp.
// TODO: preencher endereço, horário e pagamento com os dados reais da loja.

export const config = {
  // 'anuncio' = automação só para quem chegou por anúncio; 'todos' = para qualquer conversa
  automacao: 'anuncio',
  // Depois de quanto tempo parado o cliente recebe a saudação de novo
  sessaoMinutos: 30,
  // Quanto tempo o bot fica calado depois que um atendente assume a conversa
  pausaHoras: 12,
  // Vídeos maiores que isso não são enviados (o WhatsApp recusa arquivos muito grandes)
  videoMaxMB: 60,

  saudacao: [
    'Olá.',
    '',
    'Seja bem-vindo(a) a *Casa das Bicicletas*!',
    '',
    'Trabalhamos com: Bicicletas, peças/acessórios e manutenção.',
    '',
    'O que procura hoje?',
  ].join('\n'),

  perguntaPerfil: 'Ótimo! Masculina ou feminina e para qual idade?',
  perguntaGenero: 'Masculina ou feminina?',

  tabelaAros: [
    'Temos as seguintes opções:',
    '',
    '*Aro 12:* a partir de 2 anos (cerca de 85 a 100 cm de altura)',
    '*Aro 16:* de 3 a 6 anos (cerca de 100 a 120 cm)',
    '*Aro 20:* a partir de 6 anos (cerca de 115 a 135 cm)',
    '*Aro 24:* a partir de 10 anos (cerca de 130 a 150 cm)',
    '*Aro 26:* a partir de 12 anos, adolescentes e adultos (a partir de cerca de 1,50 m)',
    '*Aro 29:* a partir de 14 anos, adolescentes e adultos (a partir de cerca de 1,60 m)',
    '',
    'Todas as bicicletas são montadas, lubrificadas e reguladas por nós.',
    '',
    'Tem preferência por qual aro?',
  ].join('\n'),

  // perfil = { idade, altura }, aros = [20] ou [26, 29]
  recomendacao: ({ idade, altura }, aros) => {
    const para = altura ? `${(altura / 100).toFixed(2).replace('.', ',')} m de altura` : idade >= 18 ? 'adulto' : `${idade} anos`;
    return `Para ${para}, o ideal é *aro ${aros.join(' ou ')}*.`;
  },

  escolhaModelo: (lista) => ['Temos estas opções:', '', lista, '', 'Qual você quer ver? Responda com o *número*.'].join('\n'),

  // Depois da foto + vídeo da bike destaque
  gostou: 'Gostou desse modelo? 😊',

  semFotos: (aros) => `No momento não tenho as fotos do *aro ${aros.join(' / ')}* aqui, mas um atendente já vai te mostrar as opções. 🙋`,

  endereco: [
    '📍 *Endereço:* [PREENCHER]',
    '🕘 *Horário:* [PREENCHER]',
  ].join('\n'),

  pagamento: '💳 *Formas de pagamento:* [PREENCHER]',

  // Quando o bot passa a conversa para uma pessoa (ele fica calado depois)
  atendente: 'Certo! 🙋 Um atendente vai te responder aqui em instantes.',
  interesse: 'Ótima escolha! 🙌 Um atendente já vai te passar valores e condições.',
  outrosModelos: 'Sem problema! Temos outros modelos e cores. Um atendente já vai te mostrar as opções. 🙋',
  preco: 'Os valores variam por modelo. Um atendente já vai te passar os preços e condições. 🙋',
  pecas: 'Temos sim peças e acessórios! Me diz qual você procura que um atendente já te responde com disponibilidade e valor. 🙋',
  manutencao: 'Fazemos manutenção sim! 🔧 Me conta o que a bike tem que um atendente já te responde.',
  midiaDoCliente: 'Recebi! Um atendente já vai dar uma olhada e te responder. 🙋',
  naoEntendiFinal: 'Vou chamar um atendente para te ajudar melhor. 🙋',

  naoEntendi: 'Não entendi muito bem 😅 Você procura *bicicleta*, *peças/acessórios* ou *manutenção*?',
  naoEntendiAro: 'Me diz o *aro* (12, 16, 20, 24, 26 ou 29) ou a *idade* de quem vai usar.',
  naoEntendiEscolha: 'Responda com o *número* da opção, ou me diga outro aro.',
};
