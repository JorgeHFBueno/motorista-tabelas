// Exportar e ler planilhas do Excel (.xlsx). A biblioteca só é carregada quando alguém usa (import dinâmico).
import { hojeISO } from '../util.ts';
import { itensDoQuadro } from './Celula.tsx';
import { calcular, textoResultado } from './formula.ts';
import { textoDoValor, type Coluna, type Grupo, type Item, type Sub } from './tipos.ts';
import { porPosicao } from './useQuadro.ts';

const carregar = async () => (await import('exceljs')).default;
type Celula = string | number | Date | { text: string; hyperlink: string } | null;

const dataExcel = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)); };
const dataBR = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '');
const nomeAba = (s: string) => s.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Planilha';

function valorExcel(c: Coluna, item: Item, colunas: Coluna[], nomeUsuario: (id: unknown) => string, nomesLigados: Map<number, string>): Celula {
  const v = item.valores[c.id];
  switch (c.tipo) {
    case 'numero': case 'avaliacao': return v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
    case 'data': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? dataExcel(v) : null;
    case 'periodo': return v?.inicio || v?.fim ? `${dataBR(v.inicio ?? v.fim)} - ${dataBR(v.fim ?? v.inicio)}` : null;
    case 'caixa': return v ? 'Sim' : null;
    case 'link': {
      const url = typeof v === 'string' ? v : v?.url;
      if (!url) return null;
      return { text: (typeof v === 'object' && v.texto) || url, hyperlink: /^https?:\/\//i.test(url) ? url : `https://${url}` };
    }
    case 'ligacao': return ((v ?? []) as number[]).map(id => nomesLigados.get(id) ?? `#${id}`).join(', ') || null;
    case 'formula': {
      const r = calcular(c, item, { colunas, nomeUsuario });
      if (r.erro || r.valor === '') return null;
      return typeof r.valor === 'number' ? (Number.isFinite(r.valor) ? r.valor : null) : textoResultado(r.valor);
    }
    default: return textoDoValor(c, v, nomeUsuario) || null;
  }
}

function formatoColuna(c: Coluna): string | undefined {
  if (c.tipo === 'data') return 'dd/mm/yyyy';
  if (c.tipo === 'numero' && c.config.unidade === 'R$') return '"R$" #,##0.00';
  return undefined;
}

// Uma aba com os itens (Nome, Grupo e as colunas) e, se houver, uma aba "Subitens".
export async function exportarExcel(o: {
  arquivo: string; nomeItem: string; colunas: Coluna[]; todasColunas: Coluna[]; grupos: Grupo[]; itens: Item[]; sub: Sub | null; nomeUsuario: (id: unknown) => string;
}) {
  const ExcelJS = await carregar();
  // Colunas "Conectar quadros" guardam ids: busca os nomes dos itens ligados.
  const nomesLigados = new Map<number, string>();
  for (const c of [...o.colunas, ...(o.sub?.colunas ?? [])].filter(x => x.tipo === 'ligacao' && x.config.quadro_id)) {
    for (const i of await itensDoQuadro(Number(c.config.quadro_id))) nomesLigados.set(i.id, i.nome);
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ledur gestão';
  wb.created = new Date();
  const grupoNome = new Map(o.grupos.map(g => [g.id, g.nome]));

  const montar = (aba: string, titulos: string[], larguras: number[], formatos: (string | undefined)[], linhas: Celula[][]) => {
    const ws = wb.addWorksheet(nomeAba(aba), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = titulos.map((t, k) => ({ header: t, key: `k${k}`, width: larguras[k], style: formatos[k] ? { numFmt: formatos[k] } : {} }));
    for (const l of linhas) ws.addRow(l);
    const cab = ws.getRow(1);
    cab.font = { bold: true };
    cab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E9EF' } };
    cab.alignment = { vertical: 'middle' };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: titulos.length } };
  };
  const largura = (c: Coluna) => Math.max(10, Math.min(50, Math.round((c.largura ?? 140) / 7)));

  montar(o.arquivo.split(' - ')[0] || 'Itens',
    [o.nomeItem, 'Grupo', ...o.colunas.map(c => c.titulo)],
    [40, 22, ...o.colunas.map(largura)],
    [undefined, undefined, ...o.colunas.map(formatoColuna)],
    o.itens.map(i => [i.nome, grupoNome.get(i.grupo_id) ?? '', ...o.colunas.map(c => valorExcel(c, i, o.todasColunas, o.nomeUsuario, nomesLigados))]));

  // Subitens dos itens exportados, na ordem dos itens.
  const ordem = new Map(o.itens.map((i, k) => [i.id, k]));
  const subs = (o.sub?.itens ?? []).filter(s => ordem.has(s.item_pai_id!)).sort((a, b) => ordem.get(a.item_pai_id!)! - ordem.get(b.item_pai_id!)! || porPosicao(a, b));
  if (subs.length && o.sub) {
    const colsSub = o.sub.colunas.filter(c => !c.oculta);
    const nomePai = new Map(o.itens.map(i => [i.id, i.nome]));
    montar('Subitens',
      ['Item pai', 'Subitem', ...colsSub.map(c => c.titulo)],
      [40, 36, ...colsSub.map(largura)],
      [undefined, undefined, ...colsSub.map(formatoColuna)],
      subs.map(s => [nomePai.get(s.item_pai_id!) ?? '', s.nome, ...colsSub.map(c => valorExcel(c, s, o.sub!.colunas, o.nomeUsuario, nomesLigados))]));
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${o.arquivo.replace(/[\\/:*?"<>|]/g, '-').slice(0, 120)} ${hojeISO()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ---------------------------------------------------------------- leitura (importação)
export type Bruto = string | number | boolean | Date | { url: string; texto: string } | '';
export type Planilha = { nome: string; cabecalho: string[]; linhas: { valores: Bruto[]; grupo?: string }[] };

function valorCelula(v: unknown): Bruto {
  if (v == null) return '';
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    const o = v as Record<string, any>;
    if ('result' in o) return valorCelula(o.result); // célula com fórmula: usa o resultado
    if ('richText' in o) return (o.richText as { text: string }[]).map(r => r.text).join('');
    if ('hyperlink' in o) return { url: String(o.hyperlink), texto: typeof o.text === 'string' ? o.text : valorCelula(o.text) as string };
    if ('text' in o) return String(o.text);
    return '';
  }
  return v as Bruto;
}
const preenchida = (v: Bruto) => v !== '' && v != null;
const normal = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Lê todas as abas. O cabeçalho é a primeira linha com 2+ células preenchidas.
// Planilhas exportadas por outras ferramentas repetem o cabeçalho a cada grupo, com o nome do grupo numa linha
// sozinha logo acima: esses nomes viram o "grupo" das linhas seguintes.
export async function lerPlanilhas(arquivo: File): Promise<Planilha[]> {
  const ExcelJS = await carregar();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  return wb.worksheets.map(ws => {
    const brutas: Bruto[][] = [];
    ws.eachRow({ includeEmpty: false }, row => {
      const vals = (row.values as unknown[]).slice(1).map(valorCelula);
      if (vals.some(preenchida)) brutas.push(vals);
    });
    const ic = Math.max(0, brutas.findIndex(l => l.filter(preenchida).length >= 2));
    const n = Math.max(0, ...brutas.map(l => l.length));
    const cabecalho = Array.from({ length: n }, (_, k) => String(brutas[ic]?.[k] ?? '').trim() || `Coluna ${k + 1}`);
    const chaveCab = cabecalho.map(normal).join('|');
    const ehCabecalho = (l: Bruto[]) => Array.from({ length: n }, (_, k) => normal(l[k] ?? '') || `coluna ${k + 1}`).join('|') === chaveCab;
    const linhas: Planilha['linhas'] = [];
    let grupo: string | undefined;
    // Nome de grupo acima do primeiro cabeçalho.
    if (ic > 0 && brutas[ic - 1].filter(preenchida).length === 1) grupo = String(brutas[ic - 1].find(preenchida)).trim();
    for (let k = ic + 1; k < brutas.length; k++) {
      const l = brutas[k];
      if (ehCabecalho(l)) continue;
      if (l.filter(preenchida).length === 1 && preenchida(l[0]) && brutas[k + 1] && ehCabecalho(brutas[k + 1])) { grupo = String(l[0]).trim(); continue; }
      linhas.push({ valores: Array.from({ length: n }, (_, j) => l[j] ?? ''), grupo });
    }
    return { nome: ws.name, cabecalho, linhas };
  });
}
