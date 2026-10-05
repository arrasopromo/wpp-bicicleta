// Textos do bot. Edite à vontade — *negrito* e _itálico_ funcionam no WhatsApp.
// TODO: preencher as formas de pagamento.

export const config = {
  // 'anuncio' = automação só para quem chegou por anúncio; 'todos' = para qualquer conversa
  automacao: 'anuncio',
  // Depois de quanto tempo parado o cliente recebe a saudação de novo
  sessaoMinutos: 30,
  // Quanto tempo o bot fica calado depois que um atendente assume a conversa
  pausaHoras: 12,
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
  interesse: 'Ótima escolha! Um atendente já vai te passar valores e condições.',
  outrosModelos: 'Sem problema! Temos outros modelos e cores. Um atendente já vai te mostrar as opções.',
  preco: 'Os valores variam por modelo. Um atendente já vai te passar os preços e condições.',
  pecas: 'Temos sim peças e acessórios! Me diz qual você procura que um atendente já te responde com disponibilidade e valor.',
  manutencao: 'Fazemos manutenção sim! Me conta o que a bike tem que um atendente já te responde.',
  midiaDoCliente: 'Recebi! Um atendente já vai dar uma olhada e te responder.',
  naoEntendiFinal: 'Vou chamar um atendente para te ajudar melhor.',

  naoEntendi: 'Não entendi muito bem. Você procura *bicicleta*, *peças/acessórios* ou *manutenção*?',
  naoEntendiAro: 'Me diz o *aro* (12, 16, 20, 24, 26 ou 29) ou a *idade* de quem vai usar.',
};
