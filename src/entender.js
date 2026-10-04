// Lê a mensagem do cliente e extrai o que der: intenção, gênero, idade, altura, aro.
// Sem IA — palavras-chave e números.

export const AROS = [12, 16, 20, 24, 26, 29];

const normalizar = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const RE = {
  atendente: /\b(atendente|humano|pessoa|vendedor|vendedora|alguem|ligar|ligacao|telefone)\b/,
  preco: /\b(preco|precos|valor|valores|quanto|custa|custo|r\$|promocao|desconto|orcamento)\b/,
  endereco: /\b(endereco|onde fica|onde voces|localizacao|localiza|horario|abre|abrem|fecha|fecham|funcionamento|aberto|aberta|loja fisica)\b/,
  pagamento: /\b(pagamento|pagar|parcela|parcelas|parcelado|parcelar|cartao|pix|boleto|credito|debito|vezes|dinheiro)\b/,
  manutencao: /(manutenc|consert|arrum|revis|regulag|reparo|oficina|quebr|furad|estragad|travad|barulho)/,
  pecas: /(peca|acessori|capacete|cadeado|pneu|camara|selim|banco da|pedal|corrente|farol|lanterna|buzina|campainha|garrafa|caramanhola|luva|bomba|pezinho|descanso|cestinha|cesta|bagageiro|retrovisor|rodinha|catraca|cambio|guidao|manopla|raio)/,
  bicicleta: /(bicicleta|bike|bici\b|magrela|\baro\b|infantil|modelo|mountain|bmx|free ?ride)/,
  feminino: /(feminin|\bfem\b|menina|mulher|garota|filha|neta|sobrinha|esposa|namorada|\bmoca\b|\bela\b|afilhada)/,
  masculino: /(masculin|\bmasc\b|menino|homem|garoto|\bfilho|\bneto|sobrinho|marido|namorado|rapaz|\bele\b|afilhado)/,
  adulto: /\b(adulto|adulta|adultos|pra mim|para mim|eu mesmo|eu mesma)\b/,
  sim: /^(sim|s|quero|queria|gostei|gostei sim|isso|pode|pode ser|ok|claro|com certeza|tenho interesse|interessei|amei|top|show|perfeito)\b/,
};

export function entender(texto) {
  const t = normalizar(texto).trim();
  const r = { texto: t };
  if (!t) return r;

  for (const k of ['atendente', 'preco', 'endereco', 'pagamento', 'manutencao', 'pecas', 'bicicleta', 'sim']) {
    if (RE[k].test(t)) r[k] = true;
  }

  const f = RE.feminino.test(t);
  const m = RE.masculino.test(t);
  if (f !== m) r.genero = f ? 'F' : 'M';

  // estilos especiais: só aparecem quando o cliente pede
  if (/\bbmx\b/.test(t)) r.estilo = 'bmx';
  else if (/free ?ride/.test(t)) r.estilo = 'free ride';

  // aro: "aro 20", "aro20"
  const aro = /\baro\s*(\d{2})\b/.exec(t);
  if (aro && AROS.includes(Number(aro[1]))) r.aro = Number(aro[1]);

  // idade: "8 anos", "4 aninhos", "um ano e meio" não cobre (cai para pergunta)
  const idade = /(\d{1,2})\s*(anos?|aninhos?)\b/.exec(t);
  if (idade) r.idade = Number(idade[1]);
  else if (RE.adulto.test(t)) r.idade = 18;

  // altura: "1,40" "1.40m" "140 cm" "1 metro e 40" "1m40"
  const alturaM = /\b1\s*[,.]\s*(\d{1,2})\s*(m|metro|metros)?\b/.exec(t) || /\b1\s*m(?:etros?)?\s*e?\s*(\d{1,2})\b/.exec(t);
  const alturaCm = /\b(\d{2,3})\s*(cm|centimetros?)\b/.exec(t);
  if (alturaCm) r.altura = Number(alturaCm[1]);
  else if (alturaM) r.altura = 100 + Number(alturaM[1].padEnd(2, '0'));
  else if (/\b0\s*[,.]\s*(\d{2})\s*(m|metro)?\b/.test(t)) r.altura = Number(/\b0\s*[,.]\s*(\d{2})/.exec(t)[1]);

  // número solto: "20", "8" — quem decide o que significa é a etapa da conversa
  const numero = /^\D{0,12}?(\d{1,3})\D{0,12}$/.exec(t);
  if (numero && !r.idade && !r.altura && !r.aro) r.numero = Number(numero[1]);

  r.temPerfil = !!(r.genero || r.idade != null || r.altura || r.aro || r.estilo);
  return r;
}

// Tabela da loja: altura manda mais que idade quando o cliente informa as duas
export function arosPara({ idade, altura }) {
  if (altura) {
    if (altura < 100) return [12];
    if (altura < 115) return [16];
    if (altura < 130) return [20];
    if (altura < 150) return [24];
    if (altura < 160) return [26];
    return [26, 29];
  }
  if (idade != null) {
    if (idade < 3) return [12];
    if (idade < 6) return [16];
    if (idade < 10) return [20];
    if (idade < 12) return [24];
    if (idade < 14) return [26];
    return [26, 29];
  }
  return [];
}
