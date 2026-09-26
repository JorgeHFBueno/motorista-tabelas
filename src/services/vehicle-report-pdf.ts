import type { buildVehicleReport } from './vehicle-report.service';

const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value).replace(/\u00a0/g, ' ');
const liters = (value: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
const winAnsi: Record<string, number> = { '€': 0x80, '–': 0x96, '—': 0x97, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '•': 0x95 };

// Helvetica + WinAnsi preserva os acentos portugueses no PDF renderizado e no texto extraído.
export function sanitizePdfText(value: unknown) {
  const text = String(value ?? '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/gu, ' ').trim();
  return text.replace(/^(VEÍCULO:\s*)(.+?)\s+—\s+\2$/u, '$1$2');
}

function encodePdfText(value: string) {
  let encoded = '';
  for (const char of sanitizePdfText(value)) {
    const code = char.codePointAt(0) ?? 63;
    encoded += String.fromCharCode(winAnsi[char] ?? (code >= 32 && code <= 255 ? code : 63));
  }
  return encoded.replace(/[()\\]/g, (match) => `\\${match}`);
}

function wrapLine(line: string, width = 92): string[] {
  if (!line) return [''];
  const result: string[] = []; let current = '';
  for (const word of line.split(/\s+/)) {
    if (word.length > width) { if (current) result.push(current); for (let index = 0; index < word.length; index += width) result.push(word.slice(index, index + width)); current = ''; }
    else if (!current || current.length + word.length + 1 <= width) current = current ? `${current} ${word}` : word;
    else { result.push(current); current = word; }
  }
  if (current) result.push(current);
  return result;
}

export function createVehicleReportPdf(report: Awaited<ReturnType<typeof buildVehicleReport>>) {
  const q46 = report.erp.query46; const q47 = report.erp.query47;
  const lines = [
    'RELATÓRIO DE CUSTOS DO VEÍCULO', `VEÍCULO: ${report.veiculo.placa} — ${report.veiculo.nome}`, `PERÍODO: ${report.periodo.dataInicial} a ${report.periodo.dataFinal}`, `Gerado em: ${new Date().toLocaleString('pt-BR')}`, '',
    '1. RESUMO EXECUTIVO', `Firebase: ${money(report.totais.firebase)}`, `Firebase + ERP Q46: ${money(report.totais.firebaseQ46)}`, `Firebase + ERP Q47: ${money(report.totais.firebaseQ47)}`, `Firebase + ERP Q46 + ERP Q47: ${money(report.totais.firebaseQ46Q47)} — EXPERIMENTAL — POSSÍVEL DUPLA CONTAGEM ERP`, `Diesel interno: ${money(report.firebase.combustivel.valor)} | ${liters(report.firebase.combustivel.litros)} L | ${report.firebase.combustivel.registros} abastecimentos internos (${report.firebase.combustivel.externos} externos excluídos)`, `Manutenções: ${money(report.firebase.manutencoes.valor)} | ${report.firebase.manutencoes.registros} registros`, '',
    '2. COMBUSTÍVEL INTERNO', `Documentos encontrados antes da classificação: ${report.firebase.combustivel.registrosEncontrados}`, ...report.firebase.combustivel.itens.map((item) => `${item.data} | ${liters(item.litros)} L | ${money(item.valor)} | KM ${item.km ?? '—'} | ${item.obra || '—'} | ${item.motorista || '—'} | ${item.id}`), '',
    '3. MANUTENÇÕES', ...report.firebase.manutencoes.itens.map((item) => `${item.data} | ${item.descricao || '—'} | ${item.fornecedor || '—'} | ${money(item.valor)} | ${item.id}`), '',
    '4. ERP — QUERY 46 — CAIXA', 'Movimentos financeiros atribuídos ao subcentro do veículo.', `Lançamentos: ${q46.qtd_lancamentos} | Receitas: ${money(q46.receita)} | Despesas: ${money(q46.despesa)} | Resultado: ${money(q46.valor_resultado)}`, ...q46.mensal.map((item: any) => `${item.mes} | Lançamentos ${item.qtd_lancamentos} | Receita ${money(item.receita)} | Despesa ${money(item.despesa)} | Resultado ${money(item.valor_resultado)}`), '',
    '5. ERP — QUERY 47 — COMPETÊNCIA / NOTAS', 'Notas atribuídas ao subcentro por regime de competência.', `Notas: ${q47.notas} | Receitas: ${money(q47.receita)} | Despesas: ${money(q47.despesa)} | Resultado: ${money(q47.valor_resultado)}`, `Placa da nota preenchida: ${q47.placa_nota.preenchidas} | vazia: ${q47.placa_nota.vazias} | divergente: ${q47.placa_nota.divergentes} | transferências: ${q47.transferencias.linhas}`, ...q47.detalhes.map((item) => `${item.data} | Nº ${item.nota} | ${item.fornecedor} | ${item.natureza} | ${item.conta} | ${item.tipo} | ${money(item.valor_rateio)} | placa nota ${item.placa_nota}`), '',
    '6. COMPARATIVO ERP', `Despesas: Q46 ${money(q46.despesa)} | Q47 ${money(q47.despesa)}`, `Receitas: Q46 ${money(q46.receita)} | Q47 ${money(q47.receita)}`, `Resultado: Q46 ${money(q46.valor_resultado)} | Q47 ${money(q47.valor_resultado)}`, `Lançamentos/notas: Q46 ${q46.qtd_lancamentos} | Q47 ${q47.notas}`, '',
    '7. OBSERVAÇÕES E METODOLOGIA', 'Firestore e ERP são fontes independentes. Q46 representa caixa; Q47 representa competência/notas. Notas pagas podem aparecer nas duas visões; a soma Q46 + Q47 pode conter dupla contagem.', `Queries: 46 e 47 | Placa enviada à API: ${report.veiculo.placa.replace(/[-\s]/g, '').toUpperCase()}`,
  ].flatMap((line) => wrapLine(line));
  const pages: string[][] = []; for (let index = 0; index < lines.length; index += 74) pages.push(lines.slice(index, index + 74));
  const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] >>`];
  pages.forEach((page, index) => { const content = `BT /F1 8 Tf 40 800 Td 10 TL ${page.map((line) => `(${encodePdfText(line)}) Tj T*`).join('\n')} ET`; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> /Contents ${4 + index * 2} 0 R >>`, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`); });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  let pdf = '%PDF-1.4\n'; const offsets = [0]; objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n `).join('\n')}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([Uint8Array.from(pdf, (char) => char.charCodeAt(0))], { type: 'application/pdf' });
}
