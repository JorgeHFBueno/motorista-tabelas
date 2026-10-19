// Datas como 'YYYY-MM-DD' no fuso local.
export const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// Sem opções: formato curto "17 out" (com o ano se não for o ano corrente).
export function fmtData(iso?: string | null, opts?: Intl.DateTimeFormatOptions) {
  if (!iso) return '';
  if (!opts) {
    const [a, m, d] = iso.slice(0, 10).split('-');
    return `${Number(d)} ${MESES[Number(m) - 1]}${a !== String(new Date().getFullYear()) ? ` ${a}` : ''}`;
  }
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', opts).replace('.', '');
}
// "6 mar 2026": sempre com o ano (colunas de data configuradas assim).
export function fmtDataComAno(iso?: string | null) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MESES[Number(m) - 1]} ${a}`;
}
export function inicioDaSemana(iso: string) {
  const dow = (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
  return somarDias(iso, -dow);
}

export function fmtNumero(v: unknown, unidade = '') {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (unidade === 'R$') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: n % 1 ? 2 : 0 });
  const s = n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return unidade ? `${s} ${unidade}` : s;
}

// Posição entre dois vizinhos (reordenação sem renumerar a lista inteira).
export function posEntre(antes: number | null | undefined, depois: number | null | undefined) {
  if (antes == null && depois == null) return 1;
  if (antes == null) return (depois as number) - 1;
  if (depois == null) return antes + 1;
  return (antes + depois) / 2;
}

export const iniciais = (nome = '') => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

// Cor de texto legível sobre um fundo colorido.
export function corTexto(fundo: string) {
  const h = fundo.replace('#', '');
  if (h.length !== 6) return '#fff';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 175 ? '#323338' : '#fff';
}

export const CORES = [
  '#00a36c', '#fdab3d', '#e2445c', '#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#9cd326',
  '#cab641', '#ffcb00', '#0086c0', '#66ccff', '#bb3354', '#ff158a', '#ff5ac4', '#784bd1',
  '#7f5347', '#c4c4c4', '#808080', '#333333',
];
