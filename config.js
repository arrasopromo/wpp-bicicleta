// Textos do bot. Edite à vontade — *negrito* e _itálico_ funcionam no WhatsApp.
// TODO: preencher as formas de pagamento.

export const config = {
  // 'anuncio' = automação só para quem chegou por anúncio; 'todos' = para qualquer conversa
  automacao: 'anuncio',
  // Depois de quanto tempo parado o cliente recebe a saudação de novo
  sessaoMinutos: 30,
  // Quanto tempo o bot fica calado depois que um atendente assume a conversa
  pausaHoras: 12,
  // false = ao passar para a equipe o bot não avisa o cliente (só pausa e marca "aguardando humano")
  avisarAoPassar: false,
  // Vídeos maiores que isso não são enviados (o WhatsApp recusa arquivos muito grandes)
  videoMaxMB: 60,

  // Mensagens automáticas (boas-vindas do anúncio, saudação/ausência do WhatsApp Business):
  // não contam como atendente (não pausam o bot) nem como pergunta do cliente.
  ignorar: ['.'],

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
  // quando o cliente não respondeu o gênero e falou outra coisa
  perguntaGeneroDeNovo: 'Só pra eu te mostrar o modelo certo: é masculina ou feminina?',
  // resposta a "tem aro 16?" / "tem bmx?" antes de seguir
  temSim: (descricao) => `Temos sim, *${descricao}*!`,

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

  perguntaQualAro: (aros) => `Prefere *aro ${aros.join('* ou *aro ')}*?`,

  // "aro 26 feminina", "BMX", "aro 20 masculina"
  descrever: ({ genero, estilo }, aros) => [
    estilo ? estilo.toUpperCase() : null,
    aros.length ? `aro ${aros.join(' / ')}` : null,
    genero === 'F' ? 'feminina' : genero === 'M' ? 'masculina' : null,
  ].filter(Boolean).join(' '),

  // Depois da foto + vídeo da bike destaque
  gostou: 'Gostou desse modelo?',
  mesmaBike: 'É justamente essa que te mandei! Gostou desse modelo?',

  semFotos: (descricao) => `No momento não tenho as fotos da *${descricao}* aqui, mas um atendente já vai te mostrar as opções.`,

  endereco: [
    '*Endereço:* R. Joaquim Fonseca Ferreira, 44 - Centro, Vespasiano - MG, 33200-000',
    '',
    '*Horário:*',
    'Segunda a sexta: 8h às 18h',
    'Sábado: 8h às 15h',
    'Domingo: fechado',
  ].join('\n'),

  pagamento: '*Formas de pagamento:* [PREENCHER]',

  // Quando o bot passa a conversa para uma pessoa (ele fica calado depois)
  atendente: 'Certo! Um atendente vai te responder aqui em instantes.',
  interesse: 'Ótima escolha! Um atendente já vai falar com você para finalizar.',
  outrosModelos: 'Sem problema! Temos outros modelos e cores. Um atendente já vai te mostrar as opções.',
  entrega: 'Sobre entrega e prazo, um atendente já vai te responder aqui.',
  // Gênero de pastas que não dizem "fem"/"masc" no nome (a Aro 29 também existe feminina,
  // então o bot pergunta o gênero; feminina sem fotos → atendente)
  generoPorPasta: { 'Aro29': 'M' },

  // Preço por pasta (nome exato da pasta). Pasta sem preço aqui → o atendente passa o valor.
  precos: {
    'Aro12 fem': 'a partir de *R$ 285,00*, em até 3x',
    'Aro12 masc': 'a partir de *R$ 285,00*, em até 3x',
    'Aro16 fem': 'a partir de *R$ 545,00*, em até 6x',
    'Aro16 masc': 'a partir de *R$ 545,00*, em até 6x',
    'Aro20 fem': 'a partir de *R$ 635,00*, em até 6x',
    'Aro20 masc': 'a partir de *R$ 598,00*, em até 6x',
    'Aro20BMX': '*R$ 960,00*, em até 6x',
    'Aro24 fem': 'sem marcha a partir de *R$ 685,00*, com marcha a partir de *R$ 735,00* e com quadro de alumínio a partir de *R$ 795,00*, em até 6x',
    'Aro24 masc': 'sem marcha a partir de *R$ 665,00* e com marcha a partir de *R$ 698,00*, em até 6x',
    'Aro26 fem': 'com marcha, a partir de *R$ 719,00*',
    'Aro26 masc': 'com marcha, a partir de *R$ 719,00*',
    'Aro26 free ride': '*R$ 2.390,00*, em até 10x',
  },
  valorDaBike: (nome, preco) => `A *${nome}* sai ${preco}.`,
  finalizar: 'Gostou desse modelo?',
  // sem preço cadastrado para a bike
  precoDaBike: (nome) => `Vou pedir pra um atendente te passar o valor da *${nome}* e as condições de pagamento. Ele já te responde aqui!`,
  preco: 'Os valores variam por modelo. Um atendente já vai te passar os preços e condições.',
  pecas: 'Temos sim peças e acessórios! Me diz qual você procura que um atendente já te responde com disponibilidade e valor.',
  manutencao: 'Fazemos manutenção sim! Me conta o que a bike tem que um atendente já te responde.',
  midiaDoCliente: 'Recebi! Um atendente já vai dar uma olhada e te responder.',
  naoEntendiFinal: 'Vou chamar um atendente para te ajudar melhor.',

  naoEntendi: 'Não entendi muito bem. Você procura *bicicleta*, *peças/acessórios* ou *manutenção*?',
  naoEntendiAro: 'Me diz o *aro* (12, 16, 20, 24, 26 ou 29) ou a *idade* de quem vai usar.',
};
