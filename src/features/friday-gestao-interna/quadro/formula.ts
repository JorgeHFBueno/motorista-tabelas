// Interpretador de fórmulas no estilo monday/Excel.
// Referências a colunas são guardadas como {@<id>} ou {@<id>#Mod} (Mod: Labels, Start, End) e
// mostradas ao usuário como {Título da coluna}. {@nome}, {@criado} e {@atualizado} vêm do próprio item.
// Sem dependências do navegador: também roda no Node (validação contra os valores do monday).
import type { Coluna, Item, Rotulo } from './tipos.ts';

export type Valor = number | string | boolean;
export class ErroFormula extends Error {}

type No =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'bool'; v: boolean }
  | { t: 'ref'; ref: string; mod: string }
  | { t: 'call'; nome: string; args: No[] }
  | { t: 'bin'; op: string; a: No; b: No }
  | { t: 'un'; op: string; a: No };

// ---------------------------------------------------------------- análise léxica
type Tok = { t: 'num' | 'str' | 'ref' | 'id' | 'op' | '(' | ')' | 'sep' | 'fim'; v: string; pos: number };

function tokens(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '"' || c === '“' || c === '”' || c === "'") {
      const fecha = c === '“' ? '”' : c;
      let j = i + 1, s = '';
      for (; j < src.length; j++) {
        if (src[j] === fecha || (fecha === '"' && src[j] === '”')) { if (src[j + 1] === fecha) { s += fecha; j++; continue; } break; }
        s += src[j];
      }
      if (j >= src.length) throw new ErroFormula(`Texto sem aspas de fechamento (posição ${i + 1})`);
      out.push({ t: 'str', v: s, pos: i }); i = j + 1; continue;
    }
    if (c === '{') {
      const j = src.indexOf('}', i);
      if (j < 0) throw new ErroFormula(`Referência sem "}" (posição ${i + 1})`);
      out.push({ t: 'ref', v: src.slice(i + 1, j), pos: i }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = src.slice(i).match(/^\d*\.?\d+(?:[eE][+-]?\d+)?/)!;
      out.push({ t: 'num', v: m[0], pos: i }); i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/)!;
      out.push({ t: 'id', v: m[0].toUpperCase(), pos: i }); i += m[0].length; continue;
    }
    const dois = src.slice(i, i + 2);
    if (['<=', '>=', '<>', '!=', '=='].includes(dois)) { out.push({ t: 'op', v: dois === '!=' ? '<>' : dois === '==' ? '=' : dois, pos: i }); i += 2; continue; }
    if ('=<>+-*/^&%'.includes(c)) { out.push({ t: 'op', v: c, pos: i }); i++; continue; }
    if (c === '(' || c === ')') { out.push({ t: c, v: c, pos: i }); i++; continue; }
    if (c === ',' || c === ';') { out.push({ t: 'sep', v: c, pos: i }); i++; continue; }
    throw new ErroFormula(`Caractere inesperado "${c}" (posição ${i + 1})`);
  }
  out.push({ t: 'fim', v: '', pos: src.length });
  return out;
}

// ---------------------------------------------------------------- análise sintática
// Precedência (menor → maior): comparação, &, + -, * / %, ^, sinal.
export function analisar(src: string): No {
  const ts = tokens(src);
  let p = 0;
  const olhar = () => ts[p];
  const pegar = () => ts[p++];
  const esperar = (t: Tok['t']) => { const k = pegar(); if (k.t !== t) throw new ErroFormula(`Esperado "${t === 'sep' ? ',' : t}" perto da posição ${k.pos + 1}`); return k; };

  const binario = (prox: () => No, ops: string[]) => (): No => {
    let a = prox();
    while (olhar().t === 'op' && ops.includes(olhar().v)) { const op = pegar().v; a = { t: 'bin', op, a, b: prox() }; }
    return a;
  };
  const primario = (): No => {
    const k = pegar();
    switch (k.t) {
      case 'num': return { t: 'num', v: Number(k.v) };
      case 'str': return { t: 'str', v: k.v };
      case 'ref': {
        const conteudo = k.v.trim();
        const h = conteudo.indexOf('#');
        return h < 0 ? { t: 'ref', ref: conteudo, mod: '' } : { t: 'ref', ref: conteudo.slice(0, h).trim(), mod: conteudo.slice(h + 1).replace(/\.+$/, '').trim().toLowerCase() };
      }
      case '(': { const e = expr(); esperar(')'); return e; }
      case 'op': if (k.v === '-' || k.v === '+') return { t: 'un', op: k.v, a: potencia() }; break;
      case 'id': {
        if (olhar().t === '(') {
          pegar();
          const args: No[] = [];
          if (olhar().t !== ')') {
            for (;;) {
              args.push(olhar().t === 'sep' || olhar().t === ')' ? { t: 'str', v: '' } : expr());
              if (olhar().t === 'sep') { pegar(); continue; }
              break;
            }
          }
          esperar(')');
          return { t: 'call', nome: k.v, args };
        }
        if (k.v === 'TRUE' || k.v === 'FALSE') return { t: 'bool', v: k.v === 'TRUE' };
        throw new ErroFormula(`Nome desconhecido "${k.v}" — faltou "(" ou aspas?`);
      }
    }
    throw new ErroFormula(k.t === 'fim' ? 'A fórmula terminou antes do esperado (faltou fechar algum parêntese?)' : `"${k.v}" inesperado perto da posição ${k.pos + 1}`);
  };
  const potencia = (): No => { let a = primario(); while (olhar().t === 'op' && olhar().v === '^') { pegar(); a = { t: 'bin', op: '^', a, b: primario() }; } return a; };
  const unario = (): No => (olhar().t === 'op' && (olhar().v === '-' || olhar().v === '+') ? { t: 'un', op: pegar().v, a: unario() } : potencia());
  const mult = binario(unario, ['*', '/', '%']);
  const soma = binario(mult, ['+', '-']);
  const conc = binario(soma, ['&']);
  const comp = binario(conc, ['=', '<>', '<', '>', '<=', '>=']);
  function expr(): No { return comp(); }

  if (olhar().t === 'fim') return { t: 'str', v: '' };
  const raiz = expr();
  if (olhar().t !== 'fim') throw new ErroFormula(olhar().t === ')' ? 'Há um ")" a mais' : `Sobrou "${olhar().v}" perto da posição ${olhar().pos + 1}`);
  return raiz;
}

// ---------------------------------------------------------------- conversões
const eData = (s: string) => /^\d{4}-\d{2}-\d{2}/.test(s);
export function paraNumero(v: Valor): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = v.trim();
  if (s === '') return 0;
  const n = Number(s.replace(/\s/g, ''));
  if (Number.isFinite(n)) return n;
  throw new ErroFormula(`"${s.slice(0, 30)}" não é um número`);
}
export function paraTexto(v: Valor): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (!Number.isFinite(v)) return '';
  return String(Number(v.toFixed(10)));
}
const verdadeiro = (v: Valor) => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : v.trim() !== '' && v.trim().toLowerCase() !== 'false');

function paraData(v: Valor): Date | null {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return new Date(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) throw new ErroFormula(`"${s.slice(0, 30)}" não é uma data`);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
}
const doisDig = (n: number) => String(n).padStart(2, '0');
const isoData = (d: Date) => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
const dataHora = (d: Date) => `${isoData(d)} ${doisDig(d.getHours())}:${doisDig(d.getMinutes())}:${doisDig(d.getSeconds())}`;
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

function formatarData(d: Date, formato: string) {
  return formato.replace(/YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|mm|ss|A/g, t => {
    switch (t) {
      case 'YYYY': return String(d.getFullYear());
      case 'YY': return String(d.getFullYear()).slice(2);
      case 'MMMM': return MESES[d.getMonth()];
      case 'MMM': return MESES[d.getMonth()].slice(0, 3);
      case 'MM': return doisDig(d.getMonth() + 1);
      case 'M': return String(d.getMonth() + 1);
      case 'DD': return doisDig(d.getDate());
      case 'D': return String(d.getDate());
      case 'dddd': return DIAS_SEMANA[d.getDay()];
      case 'ddd': return DIAS_SEMANA[d.getDay()].slice(0, 3);
      case 'HH': return doisDig(d.getHours());
      case 'H': return String(d.getHours());
      case 'hh': return doisDig(d.getHours() % 12 || 12);
      case 'mm': return doisDig(d.getMinutes());
      case 'ss': return doisDig(d.getSeconds());
      case 'A': return d.getHours() < 12 ? 'AM' : 'PM';
      default: return t;
    }
  });
}

function igual(a: Valor, b: Valor): boolean {
  if (typeof a === 'number' || typeof b === 'number') {
    const sa = typeof a === 'string' ? a.trim() : null, sb = typeof b === 'string' ? b.trim() : null;
    // Vazio comparado com número vale 0 (como célula em branco no Excel).
    if ((sa !== null && sa !== '' && !Number.isFinite(Number(sa))) || (sb !== null && sb !== '' && !Number.isFinite(Number(sb)))) return paraTexto(a) === paraTexto(b);
    return paraNumero(a) === paraNumero(b);
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return verdadeiro(a) === verdadeiro(b);
  return a === b;
}
function comparar(a: Valor, b: Valor): number {
  if ((typeof a === 'number' || typeof b === 'number') && !(typeof a === 'string' && eData(a)) && !(typeof b === 'string' && eData(b))) {
    try { return paraNumero(a) - paraNumero(b); } catch { /* compara como texto */ }
  }
  const sa = paraTexto(a), sb = paraTexto(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
const arred = (n: number, casas: number, modo: 'normal' | 'cima' | 'baixo') => {
  const f = 10 ** casas;
  const x = n * f;
  const r = modo === 'normal' ? Math.sign(x) * Math.round(Math.abs(x) + 1e-9) : modo === 'cima' ? Math.sign(x) * Math.ceil(Math.abs(x) - 1e-9) : Math.sign(x) * Math.floor(Math.abs(x) + 1e-9);
  return r / f;
};
// Número "aleatório" estável por item (não muda a cada vez que a tela redesenha).
function aleatorio(semente: string) {
  let h = 2166136261;
  for (const ch of semente) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

// ---------------------------------------------------------------- funções
export type Contexto = {
  colunas: Coluna[];
  nomeUsuario: (id: unknown) => string;
  hoje?: Date;
};
type Avaliar = (n: No) => Valor;

export const FUNCOES: Record<string, { grupo: string; sintaxe: string; descricao: string; f?: (args: No[], av: Avaliar, ctx: { item: Item; hoje: Date }) => Valor; n?: (vals: Valor[], ctx: { item: Item; hoje: Date }) => Valor }> = {
  // lógica (avaliação preguiçosa)
  IF: { grupo: 'Lógica', sintaxe: 'IF(condição, se verdadeiro, se falso)', descricao: 'Escolhe um resultado conforme a condição.',
    f: (a, av) => (verdadeiro(av(a[0] ?? { t: 'bool', v: false })) ? (a[1] ? av(a[1]) : '') : a[2] ? av(a[2]) : '') },
  AND: { grupo: 'Lógica', sintaxe: 'AND(cond1, cond2, …)', descricao: 'Verdadeiro se todas forem verdadeiras.', f: (a, av) => a.every(x => verdadeiro(av(x))) },
  OR: { grupo: 'Lógica', sintaxe: 'OR(cond1, cond2, …)', descricao: 'Verdadeiro se alguma for verdadeira.', f: (a, av) => a.some(x => verdadeiro(av(x))) },
  NOT: { grupo: 'Lógica', sintaxe: 'NOT(condição)', descricao: 'Inverte verdadeiro/falso.', n: v => !verdadeiro(v[0] ?? false) },
  XOR: { grupo: 'Lógica', sintaxe: 'XOR(cond1, cond2, …)', descricao: 'Verdadeiro se um número ímpar de condições for verdadeiro.', n: v => v.filter(verdadeiro).length % 2 === 1 },
  SWITCH: { grupo: 'Lógica', sintaxe: 'SWITCH(valor, caso1, resultado1, …, padrão)', descricao: 'Compara um valor com vários casos.',
    f: (a, av) => { const v = av(a[0]); let i = 1; for (; i + 1 < a.length; i += 2) if (igual(v, av(a[i]))) return av(a[i + 1]); return i < a.length ? av(a[i]) : ''; } },
  IFERROR: { grupo: 'Lógica', sintaxe: 'IFERROR(valor, se erro)', descricao: 'Usa um valor alternativo se der erro.', f: (a, av) => { try { return av(a[0]); } catch { return a[1] ? av(a[1]) : ''; } } },
  TRUE: { grupo: 'Lógica', sintaxe: 'TRUE()', descricao: 'Verdadeiro.', n: () => true },
  FALSE: { grupo: 'Lógica', sintaxe: 'FALSE()', descricao: 'Falso.', n: () => false },
  // texto
  CONCATENATE: { grupo: 'Texto', sintaxe: 'CONCATENATE(texto1, texto2, …)', descricao: 'Junta textos (o mesmo que &).', n: v => v.map(paraTexto).join('') },
  TRIM: { grupo: 'Texto', sintaxe: 'TRIM(texto)', descricao: 'Tira espaços do início, do fim e repetidos.', n: v => paraTexto(v[0] ?? '').trim().replace(/\s+/g, ' ') },
  LEN: { grupo: 'Texto', sintaxe: 'LEN(texto)', descricao: 'Quantidade de caracteres.', n: v => paraTexto(v[0] ?? '').length },
  LEFT: { grupo: 'Texto', sintaxe: 'LEFT(texto, n)', descricao: 'Primeiros n caracteres.', n: v => paraTexto(v[0] ?? '').slice(0, v.length > 1 ? paraNumero(v[1]) : 1) },
  RIGHT: { grupo: 'Texto', sintaxe: 'RIGHT(texto, n)', descricao: 'Últimos n caracteres.', n: v => { const s = paraTexto(v[0] ?? ''); const n = v.length > 1 ? paraNumero(v[1]) : 1; return n > 0 ? s.slice(-n) : ''; } },
  MID: { grupo: 'Texto', sintaxe: 'MID(texto, início, n)', descricao: 'Trecho do texto a partir de uma posição.', n: v => paraTexto(v[0] ?? '').substr(paraNumero(v[1] ?? 1) - 1, paraNumero(v[2] ?? 0)) },
  UPPER: { grupo: 'Texto', sintaxe: 'UPPER(texto)', descricao: 'MAIÚSCULAS.', n: v => paraTexto(v[0] ?? '').toUpperCase() },
  LOWER: { grupo: 'Texto', sintaxe: 'LOWER(texto)', descricao: 'minúsculas.', n: v => paraTexto(v[0] ?? '').toLowerCase() },
  SUBSTITUTE: { grupo: 'Texto', sintaxe: 'SUBSTITUTE(texto, antigo, novo)', descricao: 'Troca um trecho por outro.', n: v => paraTexto(v[0] ?? '').split(paraTexto(v[1] ?? '')).join(paraTexto(v[2] ?? '')) },
  REPLACE: { grupo: 'Texto', sintaxe: 'REPLACE(texto, posição, n, novo)', descricao: 'Substitui n caracteres a partir de uma posição.',
    n: v => { const s = paraTexto(v[0] ?? ''); const i = paraNumero(v[1] ?? 1) - 1; return s.slice(0, i) + paraTexto(v[3] ?? '') + s.slice(i + paraNumero(v[2] ?? 0)); } },
  SEARCH: { grupo: 'Texto', sintaxe: 'SEARCH(procurar, texto)', descricao: 'Posição do trecho no texto (0 se não achar).', n: v => paraTexto(v[1] ?? '').toLowerCase().indexOf(paraTexto(v[0] ?? '').toLowerCase()) + 1 },
  EXACT: { grupo: 'Texto', sintaxe: 'EXACT(texto1, texto2)', descricao: 'Compara textos exatamente.', n: v => paraTexto(v[0] ?? '') === paraTexto(v[1] ?? '') },
  REPT: { grupo: 'Texto', sintaxe: 'REPT(texto, n)', descricao: 'Repete um texto n vezes.', n: v => paraTexto(v[0] ?? '').repeat(Math.max(0, paraNumero(v[1] ?? 0))) },
  TEXT: { grupo: 'Texto', sintaxe: 'TEXT(número, "0,00")', descricao: 'Formata um número como texto.',
    n: v => { const casas = (paraTexto(v[1] ?? '0').split(/[.,]/)[1] ?? '').length; return paraNumero(v[0] ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }); } },
  // números
  SUM: { grupo: 'Números', sintaxe: 'SUM(n1, n2, …)', descricao: 'Soma.', n: v => v.reduce<number>((s, x) => s + paraNumero(x), 0) },
  MINUS: { grupo: 'Números', sintaxe: 'MINUS(a, b)', descricao: 'Subtração.', n: v => paraNumero(v[0] ?? 0) - paraNumero(v[1] ?? 0) },
  MULTIPLY: { grupo: 'Números', sintaxe: 'MULTIPLY(a, b)', descricao: 'Multiplicação.', n: v => v.reduce<number>((s, x) => s * paraNumero(x), 1) },
  DIVIDE: { grupo: 'Números', sintaxe: 'DIVIDE(a, b)', descricao: 'Divisão.', n: v => { const b = paraNumero(v[1] ?? 0); if (b === 0) throw new ErroFormula('Divisão por zero'); return paraNumero(v[0] ?? 0) / b; } },
  AVERAGE: { grupo: 'Números', sintaxe: 'AVERAGE(n1, n2, …)', descricao: 'Média.', n: v => (v.length ? v.reduce<number>((s, x) => s + paraNumero(x), 0) / v.length : 0) },
  COUNT: { grupo: 'Números', sintaxe: 'COUNT(v1, v2, …)', descricao: 'Quantos valores são números.', n: v => v.filter(x => typeof x === 'number' || (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)))).length },
  MIN: { grupo: 'Números', sintaxe: 'MIN(n1, n2, …)', descricao: 'Menor valor.', n: v => Math.min(...v.map(paraNumero)) },
  MAX: { grupo: 'Números', sintaxe: 'MAX(n1, n2, …)', descricao: 'Maior valor.', n: v => Math.max(...v.map(paraNumero)) },
  ROUND: { grupo: 'Números', sintaxe: 'ROUND(n, casas)', descricao: 'Arredonda.', n: v => arred(paraNumero(v[0] ?? 0), paraNumero(v[1] ?? 0), 'normal') },
  ROUNDUP: { grupo: 'Números', sintaxe: 'ROUNDUP(n, casas)', descricao: 'Arredonda para cima.', n: v => arred(paraNumero(v[0] ?? 0), paraNumero(v[1] ?? 0), 'cima') },
  ROUNDDOWN: { grupo: 'Números', sintaxe: 'ROUNDDOWN(n, casas)', descricao: 'Arredonda para baixo.', n: v => arred(paraNumero(v[0] ?? 0), paraNumero(v[1] ?? 0), 'baixo') },
  CEILING: { grupo: 'Números', sintaxe: 'CEILING(n, múltiplo)', descricao: 'Arredonda para cima até o múltiplo.', n: v => { const m = v.length > 1 ? paraNumero(v[1]) || 1 : 1; return Math.ceil(paraNumero(v[0] ?? 0) / m - 1e-9) * m; } },
  FLOOR: { grupo: 'Números', sintaxe: 'FLOOR(n, múltiplo)', descricao: 'Arredonda para baixo até o múltiplo.', n: v => { const m = v.length > 1 ? paraNumero(v[1]) || 1 : 1; return Math.floor(paraNumero(v[0] ?? 0) / m + 1e-9) * m; } },
  ABS: { grupo: 'Números', sintaxe: 'ABS(n)', descricao: 'Valor absoluto.', n: v => Math.abs(paraNumero(v[0] ?? 0)) },
  MOD: { grupo: 'Números', sintaxe: 'MOD(n, divisor)', descricao: 'Resto da divisão.', n: v => { const d = paraNumero(v[1] ?? 1); return ((paraNumero(v[0] ?? 0) % d) + d) % d; } },
  POWER: { grupo: 'Números', sintaxe: 'POWER(n, expoente)', descricao: 'Potência.', n: v => paraNumero(v[0] ?? 0) ** paraNumero(v[1] ?? 1) },
  SQRT: { grupo: 'Números', sintaxe: 'SQRT(n)', descricao: 'Raiz quadrada.', n: v => Math.sqrt(paraNumero(v[0] ?? 0)) },
  LOG: { grupo: 'Números', sintaxe: 'LOG(n, base)', descricao: 'Logaritmo (base 10 se omitida).', n: v => Math.log(paraNumero(v[0] ?? 1)) / Math.log(v.length > 1 ? paraNumero(v[1]) : 10) },
  SIGN: { grupo: 'Números', sintaxe: 'SIGN(n)', descricao: '1, 0 ou -1.', n: v => Math.sign(paraNumero(v[0] ?? 0)) },
  PI: { grupo: 'Números', sintaxe: 'PI()', descricao: 'π.', n: () => Math.PI },
  RANDBETWEEN: { grupo: 'Números', sintaxe: 'RANDBETWEEN(mín, máx)', descricao: 'Número inteiro “aleatório” (fixo por item).',
    n: (v, c) => { const a = paraNumero(v[0] ?? 0), b = paraNumero(v[1] ?? 0); return Math.floor(a + aleatorio(`${c.item.id}:${a}:${b}`) * (b - a + 1)); } },
  // datas
  // Como no monday, TODAY() inclui a hora atual: DAYS({Fim}, TODAY()) dá dias "fracionados" (ex.: 134,2).
  TODAY: { grupo: 'Datas', sintaxe: 'TODAY()', descricao: 'Agora (data e hora atuais).', n: (_v, c) => dataHora(c.hoje) },
  NOW: { grupo: 'Datas', sintaxe: 'NOW()', descricao: 'Data e hora atuais.', n: (_v, c) => dataHora(c.hoje) },
  DAYS: { grupo: 'Datas', sintaxe: 'DAYS(data final, data inicial)', descricao: 'Dias entre duas datas.',
    n: v => { const a = paraData(v[0] ?? ''), b = paraData(v[1] ?? ''); if (!a || !b) return ''; return Math.round(((a.getTime() - b.getTime()) / 86400000) * 1e6) / 1e6; } },
  WORKDAYS: { grupo: 'Datas', sintaxe: 'WORKDAYS(data final, data inicial)', descricao: 'Dias úteis (seg–sex) entre as datas, incluindo as duas.',
    n: v => {
      const a = paraData(v[0] ?? ''), b = paraData(v[1] ?? '');
      if (!a || !b) return '';
      const [ini, fim, sinal] = a >= b ? [b, a, 1] : [a, b, -1];
      let n = 0;
      for (const d = new Date(ini); d <= fim; d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0) n++;
      return n * sinal;
    } },
  ADD_DAYS: { grupo: 'Datas', sintaxe: 'ADD_DAYS(data, dias)', descricao: 'Soma dias a uma data.', n: v => { const d = paraData(v[0] ?? ''); if (!d) return ''; d.setDate(d.getDate() + paraNumero(v[1] ?? 0)); return isoData(d); } },
  SUBTRACT_DAYS: { grupo: 'Datas', sintaxe: 'SUBTRACT_DAYS(data, dias)', descricao: 'Subtrai dias de uma data.', n: v => { const d = paraData(v[0] ?? ''); if (!d) return ''; d.setDate(d.getDate() - paraNumero(v[1] ?? 0)); return isoData(d); } },
  FORMAT_DATE: { grupo: 'Datas', sintaxe: 'FORMAT_DATE(data, "DD/MM/YYYY")', descricao: 'Escreve a data no formato pedido.', n: v => { const d = paraData(v[0] ?? ''); return d ? formatarData(d, v.length > 1 ? paraTexto(v[1]) : 'DD/MM/YYYY') : ''; } },
  DATE: { grupo: 'Datas', sintaxe: 'DATE(ano, mês, dia)', descricao: 'Monta uma data.', n: v => isoData(new Date(paraNumero(v[0] ?? 2000), paraNumero(v[1] ?? 1) - 1, paraNumero(v[2] ?? 1))) },
  YEAR: { grupo: 'Datas', sintaxe: 'YEAR(data)', descricao: 'Ano.', n: v => paraData(v[0] ?? '')?.getFullYear() ?? '' },
  MONTH: { grupo: 'Datas', sintaxe: 'MONTH(data)', descricao: 'Mês (1–12).', n: v => { const d = paraData(v[0] ?? ''); return d ? d.getMonth() + 1 : ''; } },
  DAY: { grupo: 'Datas', sintaxe: 'DAY(data)', descricao: 'Dia do mês.', n: v => paraData(v[0] ?? '')?.getDate() ?? '' },
  WEEKDAY: { grupo: 'Datas', sintaxe: 'WEEKDAY(data)', descricao: 'Dia da semana (1 = domingo).', n: v => { const d = paraData(v[0] ?? ''); return d ? d.getDay() + 1 : ''; } },
  WEEKNUM: { grupo: 'Datas', sintaxe: 'WEEKNUM(data)', descricao: 'Número da semana no ano.',
    n: v => { const d = paraData(v[0] ?? ''); if (!d) return ''; const j = new Date(d.getFullYear(), 0, 1); return Math.ceil(((d.getTime() - j.getTime()) / 86400000 + j.getDay() + 1) / 7); } },
  ISOWEEKNUM: { grupo: 'Datas', sintaxe: 'ISOWEEKNUM(data)', descricao: 'Semana ISO (segunda a domingo).',
    n: v => { const d = paraData(v[0] ?? ''); if (!d) return ''; const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7)); const j = new Date(t.getFullYear(), 0, 4); return 1 + Math.round(((t.getTime() - j.getTime()) / 86400000 - 3 + ((j.getDay() + 6) % 7)) / 7); } },
  HOUR: { grupo: 'Datas', sintaxe: 'HOUR(data)', descricao: 'Hora.', n: v => paraData(v[0] ?? '')?.getHours() ?? '' },
  MINUTE: { grupo: 'Datas', sintaxe: 'MINUTE(data)', descricao: 'Minuto.', n: v => paraData(v[0] ?? '')?.getMinutes() ?? '' },
};

// ---------------------------------------------------------------- valor de uma referência
function valorReferencia(c: Coluna, item: Item, mod: string, ctx: Contexto, pilha: Set<number>, hoje: Date): Valor {
  const v = item.valores[c.id];
  switch (c.tipo) {
    case 'status': {
      if (v == null || String(v) === '0') return '';
      return (c.config.rotulos as Rotulo[] | undefined)?.find(r => r.id === String(v))?.texto ?? '';
    }
    case 'lista': return ((v ?? []) as string[]).map(id => (c.config.opcoes as Rotulo[] | undefined)?.find(o => o.id === id)?.texto ?? '').filter(Boolean).join(', ');
    case 'pessoa': return ((v ?? []) as number[]).map(ctx.nomeUsuario).join(', ');
    case 'periodo': {
      const p = (v ?? {}) as { inicio?: string; fim?: string };
      if (mod === 'start' || mod === 'inicio' || mod === 'início') return p.inicio ?? '';
      if (mod === 'end' || mod === 'fim') return p.fim ?? '';
      return p.inicio || p.fim ? `${p.inicio ?? ''} - ${p.fim ?? ''}` : '';
    }
    case 'numero': case 'avaliacao': return v == null || v === '' ? '' : Number(v);
    case 'caixa': return !!v;
    case 'link': return v ? (typeof v === 'string' ? v : v.url ?? '') : '';
    case 'arquivos': return ((v ?? []) as { nome: string }[]).map(a => a.nome).join(', ');
    case 'ligacao': return ((v ?? []) as number[]).length;
    case 'formula': {
      if (pilha.has(c.id)) throw new ErroFormula(`Referência circular na coluna "${c.titulo}"`);
      return avaliarColuna(c, item, ctx, new Set([...pilha, c.id]), hoje);
    }
    default: return v == null ? '' : String(v);
  }
}

// ---------------------------------------------------------------- avaliação
const cacheArvores = new Map<string, No | ErroFormula>();
function arvore(formula: string): No {
  let a = cacheArvores.get(formula);
  if (!a) {
    try { a = analisar(formula); } catch (e) { a = e instanceof ErroFormula ? e : new ErroFormula(String(e)); }
    cacheArvores.set(formula, a);
  }
  if (a instanceof ErroFormula) throw a;
  return a;
}

function avaliarColuna(c: Coluna, item: Item, ctx: Contexto, pilha: Set<number>, hoje: Date): Valor {
  return avaliarArvore(arvore(String(c.config.formula ?? '')), item, ctx, pilha, hoje);
}

function avaliarArvore(raiz: No, item: Item, ctx: Contexto, pilha: Set<number>, hoje: Date): Valor {
  const porId = new Map(ctx.colunas.map(c => [c.id, c]));
  const av = (n: No): Valor => {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'ref': {
        if (n.ref === '@nome') return String(item.nome ?? '');
        if (n.ref === '@criado') return String(item.criado_em ?? '');
        if (n.ref === '@atualizado') return String(item.atualizado_em ?? '');
        const id = n.ref.startsWith('@') ? Number(n.ref.slice(1)) : NaN;
        const c = porId.get(id);
        if (!c) throw new ErroFormula(`Coluna não encontrada: {${n.ref.replace(/^\?/, '')}}`);
        return valorReferencia(c, item, n.mod, ctx, pilha, hoje);
      }
      case 'un': { const x = paraNumero(av(n.a)); return n.op === '-' ? -x : x; }
      case 'bin': {
        const a = av(n.a), b = av(n.b);
        switch (n.op) {
          case '&': return paraTexto(a) + paraTexto(b);
          case '=': return igual(a, b);
          case '<>': return !igual(a, b);
          case '<': return comparar(a, b) < 0;
          case '>': return comparar(a, b) > 0;
          case '<=': return comparar(a, b) <= 0;
          case '>=': return comparar(a, b) >= 0;
          case '+': return paraNumero(a) + paraNumero(b);
          case '-': return paraNumero(a) - paraNumero(b);
          case '*': return paraNumero(a) * paraNumero(b);
          case '/': { const d = paraNumero(b); if (d === 0) throw new ErroFormula('Divisão por zero'); return paraNumero(a) / d; }
          case '%': return paraNumero(a) % paraNumero(b);
          case '^': return paraNumero(a) ** paraNumero(b);
        }
        throw new ErroFormula(`Operador desconhecido ${n.op}`);
      }
      case 'call': {
        const fn = FUNCOES[n.nome];
        if (!fn) throw new ErroFormula(`Função desconhecida: ${n.nome}`);
        const c = { item, hoje };
        if (fn.f) return fn.f(n.args, av, c);
        return fn.n!(n.args.map(av), c);
      }
    }
  };
  return av(raiz);
}

// Em caso de erro, valor = '' e erro traz a mensagem.
export type Resultado = { valor: Valor; erro?: string };

// Calcula a fórmula de uma coluna para um item.
export function calcular(c: Coluna, item: Item, ctx: Contexto): Resultado {
  try {
    return { valor: avaliarColuna(c, item, ctx, new Set([c.id]), ctx.hoje ?? new Date()) };
  } catch (e) {
    return { valor: '', erro: e instanceof ErroFormula ? e.message : `Erro: ${(e as Error).message}` };
  }
}

// Texto exibido na célula: números com vírgula, verdadeiro/falso por extenso.
export function textoResultado(v: Valor): string {
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '';
  if (typeof v === 'boolean') return v ? 'Verdadeiro' : 'Falso';
  return v;
}

// ---------------------------------------------------------------- {Título} <-> {@id}
const normal = (s: string) => s.trim().toLowerCase();
export const COLUNAS_DO_ITEM = [{ ref: '@nome', titulo: 'Nome do item' }, { ref: '@criado', titulo: 'Criado em' }, { ref: '@atualizado', titulo: 'Atualizado em' }];

// Texto digitado pelo usuário (com títulos) -> formato guardado (com ids).
export function paraIds(texto: string, colunas: Coluna[]): string {
  const porTitulo = new Map(colunas.map(c => [normal(c.titulo), c.id]));
  return texto.replace(/\{([^{}]+)\}/g, (inteiro, conteudo: string) => {
    const tenta = (titulo: string, mod: string) => {
      const esp = COLUNAS_DO_ITEM.find(x => normal(x.titulo) === normal(titulo));
      if (esp) return `{${esp.ref}}`;
      const id = porTitulo.get(normal(titulo));
      return id != null ? `{@${id}${mod ? `#${mod}` : ''}}` : null;
    };
    const direto = tenta(conteudo, '');
    if (direto) return direto;
    const h = conteudo.lastIndexOf('#');
    if (h > 0) { const r = tenta(conteudo.slice(0, h), conteudo.slice(h + 1).trim()); if (r) return r; }
    return conteudo.startsWith('@') ? inteiro : `{?${conteudo}}`;
  });
}

// Formato guardado -> texto para o usuário ler/editar.
export function paraTitulos(formula: string, colunas: Coluna[]): string {
  const porId = new Map(colunas.map(c => [c.id, c.titulo]));
  return formula.replace(/\{([^{}]+)\}/g, (inteiro, conteudo: string) => {
    const esp = COLUNAS_DO_ITEM.find(x => x.ref === conteudo);
    if (esp) return `{${esp.titulo}}`;
    if (conteudo.startsWith('?')) return `{${conteudo.slice(1)}}`;
    const m = conteudo.match(/^@(\d+)(?:#(.*))?$/);
    if (!m) return inteiro;
    const t = porId.get(Number(m[1]));
    return t ? `{${t}${m[2] ? `#${m[2]}` : ''}}` : `{coluna excluída}`;
  });
}
