// O monday está fora de uso desde 2026-11-09. A importação, a cópia de arquivos e a importação de automações ficam no
// código até o fim da assinatura (02/2027), mas sem botão ou atalho na tela; a rota /friday/importar-monday continua.
export const MONDAY_NA_TELA = false;

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

// Coluna número no formato ×10 (a mesma regra dos medidores do combustível): guarda o inteiro ×10, digita-se só
// dígitos (205) e, fora da edição, mostra uma casa decimal (20,5). config.x10 = true.
type ConfigNumero = { x10?: unknown; unidade?: unknown; milhar?: unknown } | undefined;
export function fmtNumeroColuna(config: ConfigNumero, v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (config?.milhar === false) { const s = n.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 2 }); return config.unidade ? `${s} ${String(config.unidade)}` : s; }
  if (!config?.x10) return fmtNumero(n, String(config?.unidade ?? ''));
  const s = (n / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return config.unidade ? `${s} ${String(config.unidade)}` : s;
}
/**
 * Nome do item espelhado do cadastro (friday-cadastros/{chave}.nome_espelho; veículos: identificador e nome): as partes
 * juntadas com espaço; parte vazia, ou igual a uma anterior sem contar maiúsculas, fica de fora.
 */
export function nomeEspelhado(caminhos: string[], doc: Record<string, unknown> | undefined): string {
  const partes: string[] = [];
  for (const caminho of caminhos) {
    const v = caminho.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), doc);
    const t = typeof v === 'string' || typeof v === 'number' ? String(v).trim().replace(/\s+/g, ' ') : '';
    if (t && !partes.some(p => p.toLocaleLowerCase('pt-BR') === t.toLocaleLowerCase('pt-BR'))) partes.push(t);
  }
  return partes.join(' ');
}
export const NOME_TRAVADO = 'O nome vem do cadastro (identificador e nome) e não muda pelo quadro.';
/** Valor numérico exibido (desfaz o ×10). */
export const numeroExibido = (config: ConfigNumero, v: unknown) => Number(v) / (config?.x10 ? 10 : 1);
/** Número escrito em texto: "20", "20,5", "1.234,5", "20 t", "R$ 3,50". null quando não há número. */
export function lerNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').match(/-?\d[\d.]*(?:,\d+)?/);
  if (!m) return null;
  let s = m[0];
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtNumero(v: unknown, unidade = '') {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  // Reais sempre com os centavos (R$ 1.500,00), como no Excel exportado.
  if (unidade === 'R$') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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

// Redimensionar coluna arrastando a borda do cabeçalho (tabela do quadro e tabela de subitens).
export function arrastarBorda(x0: number, w0: number, min: number, max: number, aoMover: (w: number) => void, aoSoltar: (w: number) => void) {
  let w = w0;
  const mover = (e: MouseEvent) => { w = Math.max(min, Math.min(max, w0 + e.clientX - x0)); aoMover(w); };
  const soltar = () => {
    document.removeEventListener('mousemove', mover);
    document.removeEventListener('mouseup', soltar);
    document.body.classList.remove('redimensionando');
    if (w !== w0) aoSoltar(Math.round(w));
  };
  document.body.classList.add('redimensionando');
  document.addEventListener('mousemove', mover);
  document.addEventListener('mouseup', soltar);
}

// Arrastar o cabeçalho de uma coluna para outro lugar (como no monday). Só começa depois de 5 px, então um clique
// continua sendo clique (renomear, menu). Uma cópia do cabeçalho segue o mouse; com `esquerda` (onde termina a parte
// parada da tabela), chegar perto da borda rola a tabela para o lado. aoMover recebe o x do mouse; aoFim(true) ao
// soltar, aoFim(false) com Esc. O clique que o navegador dispara ao soltar é descartado.
export function arrastarCabecalho(e: MouseEvent, th: HTMLElement, rotulo: string, esquerda: number | null, aoMover: (x: number) => void, aoFim: (soltou: boolean) => void) {
  const x0 = e.clientX, y0 = e.clientY;
  let rolagem: HTMLElement | null = null;
  for (let el = th.parentElement; el && !rolagem; el = el.parentElement) if (/(auto|scroll)/.test(getComputedStyle(el).overflowX)) rolagem = el;
  let copia: HTMLElement | null = null;
  let x = x0;
  let quadro = 0;
  const rolar = () => {
    const caixa = rolagem!.getBoundingClientRect();
    const passo = x < esquerda! + 40 ? -14 : x > caixa.right - 40 ? 14 : 0;
    if (passo) { rolagem!.scrollLeft += passo; aoMover(x); }
    quadro = requestAnimationFrame(rolar);
  };
  const mover = (ev: MouseEvent) => {
    x = ev.clientX;
    if (!copia) {
      if (Math.abs(x - x0) < 5 && Math.abs(ev.clientY - y0) < 5) return;
      const r = th.getBoundingClientRect();
      copia = document.createElement('div');
      copia.className = 'coluna-fantasma';
      copia.textContent = rotulo;
      Object.assign(copia.style, { top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      copia.dataset.dx = String(x0 - r.left);
      (th.closest('.friday-root') ?? document.body).appendChild(copia);
      document.body.classList.add('arrastando-coluna');
      window.getSelection()?.removeAllRanges();
      if (rolagem && esquerda != null) quadro = requestAnimationFrame(rolar);
    }
    copia.style.left = `${x - Number(copia.dataset.dx)}px`;
    aoMover(x);
  };
  const fim = (soltou: boolean) => {
    document.removeEventListener('mousemove', mover);
    document.removeEventListener('mouseup', soltar);
    document.removeEventListener('keydown', tecla, true);
    if (!copia) return;
    cancelAnimationFrame(quadro);
    copia.remove();
    document.body.classList.remove('arrastando-coluna');
    // Com Esc o botão ainda está apertado: o clique vem só quando ele for solto.
    if (soltou) descartarClique(); else document.addEventListener('mouseup', descartarClique, { once: true });
    aoFim(soltou);
  };
  const descartarClique = () => {
    const descartar = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', descartar, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', descartar, true));
  };
  const soltar = () => fim(true);
  const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && copia) { ev.stopPropagation(); fim(false); } };
  document.addEventListener('mousemove', mover);
  document.addEventListener('mouseup', soltar);
  document.addEventListener('keydown', tecla, true);
}

// Duplo clique na borda: a coluna à esquerda dela fica do tamanho do conteúdo (como no monday). Mede as linhas
// visíveis das tabelas com a coluna estreita: o que transborda (texto cortado com "…") soma à largura. Só conta as
// linhas com nCelulas células (as com células mescladas, como subitens e novo item, ficam de fora).
export function larguraDoConteudo(tabelas: HTMLTableElement[], indice: number, nCelulas: number, min: number, max: number) {
  const cols = tabelas.map(t => t.querySelector<HTMLElement>(`:scope > colgroup > col:nth-child(${indice + 1})`));
  const antes = cols.map(c => c?.style.width ?? '');
  cols.forEach(c => { if (c) c.style.width = `${min}px`; });
  let w = min;
  for (const t of tabelas) for (const tr of t.rows) {
    if (tr.cells.length !== nCelulas) continue;
    const td = tr.cells[indice];
    const cortado = Math.max(0, ...[...td.querySelectorAll<HTMLElement>('*')].map(el => el.scrollWidth - el.clientWidth));
    w = Math.max(w, td.scrollWidth + cortado);
  }
  cols.forEach((c, k) => { if (c) c.style.width = antes[k]; });
  return Math.min(max, Math.ceil(w) + 4);
}
