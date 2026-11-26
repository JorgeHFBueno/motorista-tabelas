import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOVIMENTOS, produtoExemplo } from '../src/features/erp/estoques/estoquesExemplo';
import { relatorioEstoque } from '../src/features/erp/estoques/relatoriosEstoque';
import { lerNfe } from '../src/features/erp/notas/nfeXml';
import { chaveNfe, fornecedorDoEmitente, nfeDeExemplo, NOTAS_EXEMPLO, produtoDoItem } from '../src/features/erp/notas/notasExemplo';

// Notas do ERP em demonstração (The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp).

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe43261111222333000181550010000012341000012345" versao="4.00">
<ide><natOp>VENDA DE PRODUCAO</natOp><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-20T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>11222333000181</CNPJ><xNome>AREIA E BRITA MODELO LTDA</xNome><enderEmit><xMun>Venancio Aires</xMun><UF>RS</UF></enderEmit></emit>
<dest><CNPJ>99888777000166</CNPJ><xNome>LEDUR ENGENHARIA E CONSTRUCOES</xNome></dest>
<det nItem="1"><prod><cProd>BR-1</cProd><cEAN>SEM GTIN</cEAN><xProd>BRITA 1</xProd><NCM>25171000</NCM><CFOP>5101</CFOP><uCom>M3</uCom><qCom>20.0000</qCom>
<vUnCom>140.0000000000</vUnCom><vProd>2800.00</vProd></prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>2800.00</vBC><pICMS>17.00</pICMS><vICMS>476.00</vICMS></ICMS00></ICMS>
<PIS><PISAliq><CST>01</CST><pPIS>1.65</pPIS><vPIS>46.20</vPIS></PISAliq></PIS></imposto></det>
<det nItem="2"><prod><cProd>X9</cProd><xProd>AREIA GROSSA &amp; LAVADA</xProd><uCom>M3</uCom><qCom>5</qCom><vUnCom>100</vUnCom><vProd>500.00</vProd></prod><imposto/></det>
<total><ICMSTot><vBC>2800.00</vBC><vICMS>476.00</vICMS><vProd>3300.00</vProd><vFrete>0.00</vFrete><vNF>3300.00</vNF></ICMSTot></total>
<transp><modFrete>0</modFrete><vol><qVol>2</qVol><pesoB>40000</pesoB></vol></transp>
<cobr><dup><nDup>001</nDup><dVenc>2026-12-18</dVenc><vDup>3300.00</vDup></dup></cobr>
<infAdic><infCpl>Obra Centro</infCpl></infAdic></infNFe></NFe></nfeProc>`;

test('lerNfe reads header, items, totals, duplicates and transport', () => {
  const n = lerNfe(XML);
  assert.equal(n.chave, '43261111222333000181550010000012341000012345');
  assert.equal(n.numero, 1234);
  assert.equal(n.emissao, '2026-11-20');
  assert.equal(n.emitente.documento, '11222333000181');
  assert.equal(n.itens.length, 2);
  assert.equal(n.itens[0].cst, '000');
  assert.equal(n.itens[0].aliqIcms, 17);
  assert.equal(n.itens[0].ean, null);
  assert.equal(n.itens[1].descricao, 'AREIA GROSSA & LAVADA');
  assert.equal(n.totais.total, 3300);
  assert.deepEqual(n.duplicatas, [{ numero: '001', vencimento: '2026-12-18', valor: 3300 }]);
  assert.equal(n.transporte.pesoBruto, 40000);
  assert.equal(n.informacoes, 'Obra Centro');
  assert.throws(() => lerNfe('<xml/>'), /não é um XML de NF-e/);
});

test('XML items link to products and the supplier to the register', () => {
  const n = lerNfe(XML);
  assert.equal(produtoDoItem(n.itens[0])?.codigo, 1003);
  assert.equal(produtoDoItem(n.itens[1]), null);
  assert.equal(fornecedorDoEmitente(n.emitente.documento, n.emitente.nome)?.codigo, 1088);
  const exemplo = nfeDeExemplo('2026-11-26');
  assert.deepEqual(exemplo.itens.map((i) => produtoDoItem(i)?.codigo ?? null), [1001, 1004, null]);
  assert.equal(fornecedorDoEmitente(exemplo.emitente.documento, exemplo.emitente.nome)?.codigo, 1312);
});

test('sample notes come from the Kardex movements and add up', () => {
  const numeros = new Set(MOVIMENTOS.map((m) => m.origem.match(/^Nota (\d+)/)?.[1]).filter(Boolean).map(Number));
  assert.equal(NOTAS_EXEMPLO.length, numeros.size);
  for (const n of NOTAS_EXEMPLO) {
    assert.equal(n.chave.length, 44);
    assert.equal(Math.round(n.itens.reduce((t, i) => t + i.valorTotal, 0) * 100) / 100, n.totais.produtos);
    if (n.tipo === 'E') assert.equal(Math.round(n.duplicatas.reduce((t, d) => t + d.valor, 0) * 100) / 100, n.totais.total);
    for (const i of n.itens) {
      const m = MOVIMENTOS.find((x) => x.origem.startsWith(`Nota ${n.numero}`) && x.produto === i.produto)!;
      assert.ok(Math.abs(i.quantidade * i.fator - m.quantidade) < 0.01, `quantidade do item ${i.produto} da nota ${n.numero}`);
    }
  }
  const cimento = NOTAS_EXEMPLO.flatMap((n) => n.itens).find((i) => i.produto === 1001)!;
  assert.equal(cimento.unidade, produtoExemplo(1001)!.unidadeCompra);
  assert.equal(cimento.fator, 50);
});

test('access key check digit (module 11)', () => {
  const chave = chaveNfe('RS', '2026-11-20', '11222333000181', '1', 1234);
  const base = chave.slice(0, 43);
  let soma = 0;
  for (let i = base.length - 1, peso = 2; i >= 0; i--, peso = peso === 9 ? 2 : peso + 1) soma += Number(base[i]) * peso;
  assert.equal(Number(chave[43]), soma % 11 < 2 ? 0 : 11 - (soma % 11));
});

test('Relação de Notas: summary by note, detailed by item with grouping', () => {
  const def = relatorioEstoque('notas')!;
  const f = { empresa: '', cliente: '', de: '2026-01-01', ate: '2026-12-31', tipo: 'T', analise: 'resumida', compras: 'true', vendas: 'true', situacao: 'lancada' };
  const resumo = def.gerar(f);
  assert.equal(resumo.length, NOTAS_EXEMPLO.length);
  assert.equal(def.gerar({ ...f, tipo: 'S' }).every((l) => l.tipo === 'Saída'), true);
  assert.equal(def.gerar({ ...f, compras: '' }).every((l) => l.tipo === 'Saída'), true);
  const detalhe = def.gerar({ ...f, analise: 'detalhada' });
  assert.equal(detalhe.length, NOTAS_EXEMPLO.reduce((t, n) => t + n.itens.length, 0));
  assert.equal(typeof def.quebra === 'function' ? def.quebra({ ...f, analise: 'detalhada' }) : def.quebra, 'nota');
});
