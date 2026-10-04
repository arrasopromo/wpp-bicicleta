// Textos do bot. Edite à vontade — *negrito* e _itálico_ funcionam no WhatsApp.
// TODO: preencher endereço, horário e pagamento com os dados reais da loja.

export const config = {
  // 'anuncio' = automação só para quem chegou por anúncio; 'todos' = para qualquer conversa
  automacao: 'anuncio',
  // Depois de quanto tempo parado o cliente recebe a saudação de novo
  sessaoMinutos: 30,
  // Quanto tempo o bot fica calado depois que um atendente responde (pelo celular ou pelo CRM)
  pausaHoras: 12,
  // Vídeos maiores que isso não são enviados (o WhatsApp recusa arquivos muito grandes)
  videoMaxMB: 60,

  saudacao: (nome) =>
    `Olá${nome ? `, ${nome}` : ''}! 🚲 Bem-vindo(a) à *Casa das Bicicletas*.`,

  saudacaoAnuncio: (nome, anuncio) =>
    `Olá${nome ? `, ${nome}` : ''}! 🚲 Que bom que você viu nosso anúncio${anuncio ? ` *${anuncio}*` : ''}! Aqui é a *Casa das Bicicletas*.`,

  menu: [
    'Como posso te ajudar? Responda com o *número*:',
    '',
    '*1* - Ver bicicletas',
    '*2* - Endereço e horário',
    '*3* - Formas de pagamento',
    '*4* - Falar com um atendente',
  ].join('\n'),

  endereco: [
    '📍 *Endereço:* [PREENCHER]',
    '🕘 *Horário:* [PREENCHER]',
  ].join('\n'),

  pagamento: '💳 *Formas de pagamento:* [PREENCHER]',

  atendente:
    'Certo! 🙋 Um atendente vai te responder aqui em instantes.',

  escolhaAro: (lista) =>
    ['Qual bicicleta você quer ver? Responda com o *número*:', '', lista, '', '*0* - Voltar ao menu'].join('\n'),

  enviandoFotos: (nome) => `Enviando fotos e vídeos da *${nome}*... 📸`,

  depoisDasFotos:
    'Gostou de alguma? Responda *4* para falar com um atendente ou *1* para ver outra bicicleta. *0* volta ao menu.',

  naoEntendi: 'Não entendi 😅 Responda só com o *número* da opção.',
};
