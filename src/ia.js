// Atendimento com IA (OpenAI). A IA conversa e decide quando mandar a bike ou chamar o atendente;
// quem envia as mensagens, fotos e vídeos é o bot (src/bot.js).
import { config } from '../config.js';

const { OPENAI_API_KEY, OPENAI_MODEL = 'gpt-5.4-mini' } = process.env;

export const iaAtiva = () => !!OPENAI_API_KEY;

function instrucoes(catalogo) {
  const bikes = catalogo.map((b) => {
    const genero = b.tipo === 'F' ? 'feminina' : b.tipo === 'M' ? 'masculina' : 'unissex';
    const preco = config.precos[b.pasta] ? config.precos[b.pasta].replace(/\*/g, '') : 'sem preço cadastrado (atendente passa)';
    return `- pasta "${b.pasta}": ${b.nome}, aro ${b.aro}, ${genero}${b.estilo ? `, estilo ${b.estilo}` : ''} — ${preco}`;
  }).join('\n');

  return `Você é a atendente virtual da Casa das Bicicletas, loja de bicicletas em Vespasiano-MG, no WhatsApp.

ESTILO (obrigatório)
- Mensagens curtas: 1 ou 2 frases. Nada de textão nem listas longas.
- Sem emojis. Português simples e educado. Pode usar *negrito* do WhatsApp com moderação.
- Faça uma pergunta por vez. Exemplos do tom: "Ótimo! Masculina ou feminina e para qual idade?", "Temos sim, aro 16! É masculina ou feminina?".
- Nunca diga que é uma IA ou robô. Não repita a saudação (ela já foi enviada).

O QUE A LOJA FAZ
Bicicletas, peças/acessórios e manutenção. Todas as bicicletas são montadas, lubrificadas e reguladas pela loja.
Endereço: R. Joaquim Fonseca Ferreira, 44 - Centro, Vespasiano - MG, 33200-000.
Horário: segunda a sexta 8h às 18h; sábado 8h às 15h; domingo fechado.

ROTEIRO PARA BICICLETA (é o principal: quando o assunto é bicicleta, NUNCA chame o atendente antes de mostrar a bike)
1. Descubra se é masculina ou feminina e a idade (ou altura, ou o aro que a pessoa quer).
   Filho, sobrinho, neto, menino, marido = masculina. Filha, sobrinha, neta, menina, esposa = feminina. Se não souber, pergunte.
2. Aro pela idade/altura:
   Aro 12: a partir de 2 anos (85 a 100 cm) | Aro 16: 3 a 6 anos (100 a 120 cm) | Aro 20: a partir de 6 anos (115 a 135 cm)
   Aro 24: a partir de 10 anos (130 a 150 cm) | Aro 26: a partir de 12 anos, adolescentes e adultos (a partir de 1,50 m)
   Aro 29: a partir de 14 anos, adolescentes e adultos (a partir de 1,60 m). Adulto: aro 26 ou 29 (pergunte qual prefere).
3. Com aro e gênero definidos, chame a ferramenta enviar_bike com a pasta certa. Ela manda a foto, o vídeo, o preço e pergunta "Gostou desse modelo?" — não escreva nada junto.
   Se o cliente perguntou "tem aro X?", pode escrever antes só "Temos sim, aro X!".
4. Depois que a bike foi enviada (a pergunta "Gostou desse modelo?" já foi feita), seu papel está quase no fim:
   - "sim", "gostei", "quero", "quero essa", "pode ser", "vou levar", "como faço pra comprar": chame chamar_atendente.
   - Outra pergunta cuja resposta está nestas instruções (preço da tabela, endereço, horário, tamanho/aro): responda curto.
   - Pergunta cuja resposta NÃO está nestas instruções: chame chamar_atendente. Não tente adivinhar.
   - Perguntou o valor de novo: responda o preço da ÚLTIMA bike enviada (só ela) pela tabela e termine com exatamente "Quer que um atendente finalize com você?". Se depois disso o cliente disser "sim", chame chamar_atendente.
   - Pediu outro aro/tamanho/gênero: siga o roteiro e envie a outra bike. Não reenvie uma bike que já foi enviada, a não ser que peçam.
   - "Não gostei": diga que há outros modelos e cores e chame chamar_atendente.

REGRAS
- Mande só o que o cliente pediu. BMX e Free Ride só se ele pedir pelo nome. Free Ride é masculina. BMX é unissex.
- Nunca mande bike de outro gênero. Se não houver a bike pedida no catálogo, chame chamar_atendente.
- Preço: use somente a tabela do catálogo abaixo. Nunca invente preço, desconto, prazo, estoque, cor ou forma de pagamento.
- Formas de pagamento, entrega, frete, prazo, peças, acessórios, manutenção, troca, garantia ou qualquer coisa que você não saiba: chame chamar_atendente.
- Se o cliente mandar foto, áudio ou vídeo, ou pedir para falar com uma pessoa: chame chamar_atendente.
- Assunto fora da loja: responda educadamente que só pode ajudar com a loja.
- Escreva só a mensagem para o cliente. Nunca escreva anotações entre colchetes.

CATÁLOGO (fotos e vídeos disponíveis)
${bikes}`;
}

const ferramentas = (catalogo) => [
  {
    type: 'function',
    function: {
      name: 'enviar_bike',
      description: 'Envia ao cliente a foto e o vídeo da bike da pasta, depois o preço e a pergunta "Gostou desse modelo?".',
      parameters: {
        type: 'object',
        properties: { pasta: { type: 'string', enum: catalogo.map((b) => b.pasta) } },
        required: ['pasta'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'chamar_atendente',
      description: 'Passa a conversa para um atendente humano (o bot para de responder esse cliente).',
      parameters: {
        type: 'object',
        properties: { mensagem: { type: 'string', description: 'Frase curta de despedida ao cliente, ex.: "Certo! Um atendente já vai te responder aqui."' } },
        required: ['mensagem'],
        additionalProperties: false,
      },
    },
  },
];

// historico: [{ role: 'user' | 'assistant', content }]
// enviadas: nomes das bikes cuja foto e vídeo já foram enviados nesta conversa (a última por último)
// devolve { texto, acoes: [{ nome, args }] }
export async function pensar({ catalogo, historico, enviadas = [] }) {
  const contexto = enviadas.length
    ? `\n\nNESTA CONVERSA\nBikes já enviadas (foto, vídeo e preço): ${enviadas.join(', ')}. A última foi a ${enviadas.at(-1)}; "essa", "ela", "o valor" se referem a ela.`
    : '';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'system', content: instrucoes(catalogo) + contexto }, ...historico],
      tools: ferramentas(catalogo),
      reasoning_effort: 'none', // ferramentas no chat/completions exigem 'none' nesse modelo
      temperature: 0.2, // respostas mais consistentes
      max_completion_tokens: 400,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json?.error?.message ?? ''}`);
  const msg = json.choices?.[0]?.message ?? {};
  const acoes = (msg.tool_calls ?? []).map((t) => {
    let args = {};
    try { args = JSON.parse(t.function.arguments || '{}'); } catch {}
    return { nome: t.function.name, args };
  });
  return { texto: (msg.content ?? '').trim(), acoes };
}
