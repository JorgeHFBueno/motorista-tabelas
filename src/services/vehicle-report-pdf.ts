import type { buildVehicleReport } from './vehicle-report.service';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value).replace(/\u00a0/g, ' ');
const liters = (value: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const winAnsi: Record<string, number> = { '€': 0x80, '–': 0x96, '—': 0x97, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95 };

/** Presentation-only ERP cleanup. U+FFFE is Unicode category Cn (Other/invalid). */
export function sanitizeErpPresentationText(value: unknown) {
  return String(value ?? '').replace(/[\p{C}]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

export function sanitizePdfText(value: unknown) {
  const text = sanitizeErpPresentationText(value);
  return text.replace(/^(VEÍCULO:\s*)(.+?)\s+—\s+\2$/u, '$1$2');
}

function normalizeVehicleIdentity(value: unknown) {
  return sanitizeErpPresentationText(value).normalize('NFKC').toLocaleUpperCase('pt-BR').replace(/[\s-]+/gu, '');
}

export function formatVehicleReportHeader(placa: unknown, descricao: unknown) {
  const plate = sanitizeErpPresentationText(placa);
  const name = sanitizeErpPresentationText(descricao);
  return normalizeVehicleIdentity(plate) === normalizeVehicleIdentity(name) || !name
    ? `Veículo: ${plate}`
    : `Veículo: ${plate} — ${name}`;
}

export function formatReportDate(value: unknown) {
  const text = sanitizeErpPresentationText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/u.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function encodePdfText(value: string) {
  let encoded = '';
  for (const char of sanitizePdfText(value)) {
    const code = char.codePointAt(0) ?? 63;
    encoded += String.fromCharCode(winAnsi[char] ?? (code >= 32 && code <= 255 ? code : 63));
  }
  return encoded.replace(/[()\\]/g, (match) => `\\${match}`);
}

const PAGE = { left: 36, right: 559, top: 800, bottom: 48 };
const colors = { ink: '0.12 0.15 0.18', border: '0.72 0.75 0.78', header: '0.92 0.93 0.95', section: '0.78 0.87 0.96', total: '0.88 0.93 0.97' };
type PdfPage = { commands: string[] };
type PdfReport = Awaited<ReturnType<typeof buildVehicleReport>>;

function wrap(value: unknown, width: number) {
  const words = (sanitizeErpPresentationText(value) || '—').split(' '); const lines: string[] = []; let line = '';
  for (const word of words) {
    if (word.length > width) { if (line) lines.push(line); for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width)); line = ''; }
    else if (!line || line.length + word.length + 1 <= width) line = line ? `${line} ${word}` : word;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line); return lines.length ? lines : ['—'];
}

function createDrawing() {
  const pages: PdfPage[] = [{ commands: [] }]; let page = pages[0]; let y = PAGE.top;
  const newPage = () => { page = { commands: [] }; pages.push(page); y = PAGE.top; };
  const command = (value: string) => page.commands.push(value);
  const text = (x: number, baseline: number, value: unknown, size = 8, bold = false) => command(`BT /F${bold ? 2 : 1} ${size} Tf ${colors.ink} rg 1 0 0 1 ${x.toFixed(1)} ${baseline.toFixed(1)} Tm (${encodePdfText(String(value ?? ''))}) Tj ET`);
  const rect = (x: number, top: number, width: number, height: number, fill?: string) => { if (fill) command(`q ${fill} rg ${x.toFixed(1)} ${(top - height).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re f Q`); command(`q ${colors.border} RG 0.35 w ${x.toFixed(1)} ${(top - height).toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re S Q`); };
  const ensure = (height: number) => { if (y - height < PAGE.bottom + 18) { page = { commands: [] }; pages.push(page); y = 800; } };
  const title = (value: string) => { ensure(34); text(PAGE.left, y, value, 15, true); y -= 22; };
  const section = (value: string) => { ensure(28); rect(PAGE.left, y, PAGE.right - PAGE.left, 18, colors.section); text(PAGE.left + 6, y - 12, value, 9, true); y -= 25; };
  const table = (headers: string[], rows: unknown[][], widths: number[], rightAligned = new Set<number>(), totalRows = new Set<number>()) => {
    const x0 = PAGE.left; const row = (cells: unknown[], fill?: string, bold = false) => {
      const wrapped = cells.map((cell, i) => wrap(cell, Math.max(5, Math.floor(widths[i] / 5.1)))); const height = Math.max(...wrapped.map((lines) => lines.length)) * 9 + 7;
      if (y - height < PAGE.bottom + 20) { page = { commands: [] }; pages.push(page); y = 800; row(headers, colors.header, true); }
      let x = x0; rect(x, y, widths.reduce((a, b) => a + b, 0), height, fill); cells.forEach((cell, i) => { const lines = wrapped[i]; lines.forEach((line, j) => { const tx = rightAligned.has(i) ? x + widths[i] - 4 - line.length * 4.1 : x + 4; text(tx, y - 11 - j * 9, line, 7.2, bold); }); x += widths[i]; });
      for (let i = 1, offset = x0; i < widths.length; i++) { offset += widths[i - 1]; command(`${colors.border} RG 0.35 w ${offset.toFixed(1)} ${(y - height).toFixed(1)} m ${offset.toFixed(1)} ${y.toFixed(1)} l S`); }
      y -= height;
    };
    row(headers, colors.header, true); rows.forEach((cells, index) => row(cells, totalRows.has(index) ? colors.total : undefined, totalRows.has(index))); y -= 8;
  };
  return { pages, get y() { return y; }, set y(value: number) { y = value; }, title, section, table, text };
}

export function createVehicleReportPdf(report: PdfReport) {
  const q47 = report.erp.query47 as any; const drawing = createDrawing(); const right = (indexes: number[]) => new Set(indexes);
  drawing.title('RELATÓRIO DE CUSTOS DO VEÍCULO');
  drawing.text(PAGE.left, drawing.y, formatVehicleReportHeader(report.veiculo.placa, report.veiculo.nome), 9, true); drawing.y -= 13;
  drawing.text(PAGE.left, drawing.y, `Período: ${formatReportDate(report.periodo.dataInicial)} a ${formatReportDate(report.periodo.dataFinal)}   Gerado em: ${new Date().toLocaleString('pt-BR')}`, 8); drawing.y -= 18;
  drawing.section('RESUMO EXECUTIVO');
  drawing.table(['Componente', 'Valor'], [['Firebase', money(report.totais.firebase)], ['ERP Q47 — Competência / Notas', money(report.totais.erpQ47)], ['Total consolidado', money(report.totais.consolidado)]], [350, 173], right([1]), new Set([2]));
  drawing.table(['Componente', 'Quantidade', 'Valor'], [['Diesel interno', `${liters(report.firebase.combustivel.litros)} L / ${report.firebase.combustivel.registros} abastecimentos`, money(report.firebase.combustivel.valor)], ['Abastecimentos externos excluídos', report.firebase.combustivel.externos, '—'], ['Manutenções', `${report.firebase.manutencoes.registros} registros`, money(report.firebase.manutencoes.valor)]], [250, 160, 113], right([1, 2]));
  drawing.section('COMBUSTÍVEL INTERNO'); drawing.text(PAGE.left, drawing.y, `Documentos encontrados antes da classificação: ${report.firebase.combustivel.registrosEncontrados}`, 7); drawing.y -= 13;
  drawing.table(['Data', 'Litros', 'Valor', 'KM', 'Obra', 'Responsável'], report.firebase.combustivel.itens.map((item: any) => [item.data, `${liters(item.litros)} L`, money(item.valor), item.km ?? '—', item.obra, item.motorista]), [62, 58, 73, 48, 145, 137], right([1, 2, 3]));
  drawing.section('MANUTENÇÕES'); drawing.table(['Data', 'Descrição', 'Fornecedor', 'Valor'], report.firebase.manutencoes.itens.map((item: any) => [item.data, item.descricao, item.fornecedor, money(item.valor)]), [64, 190, 170, 99], right([3]));
  drawing.section('ERP Q47 — COMPETÊNCIA / NOTAS'); drawing.table(['Data', 'Nota', 'Fornecedor', 'Natureza / conta', 'Tipo', 'Valor'], q47.detalhes.map((item: any) => [formatReportDate(item.data), item.nota, item.fornecedor, `${item.natureza} / ${item.conta}`, item.tipo, money(item.valor_rateio)]), [57, 43, 125, 150, 65, 83], right([5]));
  drawing.section('METODOLOGIA / PARÂMETROS'); drawing.table(['Parâmetro', 'Valor'], [['Veículo', report.veiculo.placa], ['Período', `${formatReportDate(report.periodo.dataInicial)} a ${formatReportDate(report.periodo.dataFinal)}`], ['Diesel interno', 'R$ 5,90/L'], ['Documentos combustível encontrados', report.firebase.combustivel.registrosEncontrados], ['Internos / externos excluídos', `${report.firebase.combustivel.registros} / ${report.firebase.combustivel.externos}`], ['ERP', 'Query 47 — competência / notas'], ['Placa enviada ao ERP', report.veiculo.placa.replace(/[-\s]/g, '').toUpperCase()]], [250, 273]);
  const pages = drawing.pages; pages.forEach((page, index) => { page.commands.push(`BT /F1 7 Tf ${colors.ink} rg 1 0 0 1 ${PAGE.left} 27 Tm (${encodePdfText('Ledur Motorista — relatório veicular')}) Tj ET`); page.commands.push(`BT /F1 7 Tf ${colors.ink} rg 1 0 0 1 470 27 Tm (${encodePdfText(`Pág. ${index + 1} de ${pages.length}`)}) Tj ET`); });
  const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] >>`];
  pages.forEach((page, index) => { const content = page.commands.join('\n'); objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R /F2 ${4 + pages.length * 2} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`); });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  let pdf = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([Uint8Array.from(pdf, (char) => char.charCodeAt(0))], { type: 'application/pdf' });
}
