// Leitura do XML da NF-e (modelo 55, layout 4.00; nfeProc ou NFe sozinha) para a Entrada de Fornecedor, como a do ERP
// do Samuel (server/src/erp/nfe.ts): sem biblioteca, o layout é fixo e só interessam emitente, destinatário, itens,
// totais, duplicatas e transporte. Aqui roda no navegador: o arquivo não sai da máquina e nada é gravado.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export type ItemNfe = {
  item: number; codigo: string; ean: string | null; descricao: string; ncm: string | null; cfop: string | null; unidade: string | null;
  quantidade: number; valorUnitario: number; valorTotal: number; desconto: number; ipi: number; icms: number; icmsSt: number;
  cst: string | null; baseIcms: number; aliqIcms: number; aliqIpi: number; baseSt: number; aliqSt: number;
  baseFcpSt: number; aliqFcpSt: number; fcpSt: number; cstPis: string | null; aliqPis: number; pis: number;
  cstCofins: string | null; aliqCofins: number; cofins: number;
};
export type Nfe = {
  chave: string | null; numero: number; serie: string | null; modelo: string; emissao: string; natureza: string | null;
  emitente: { documento: string; nome: string; municipio: string | null; uf: string | null };
  destinatario: { documento: string | null; nome: string | null };
  itens: ItemNfe[];
  totais: { produtos: number; frete: number; seguro: number; desconto: number; outros: number; ipi: number; icms: number; icmsSt: number; total: number };
  duplicatas: Array<{ numero: string; vencimento: string; valor: number }>;
  informacoes: string | null;
  informacoesFisco: string | null;
  transporte: { modalidade: string | null; documento: string | null; nome: string | null; placa: string | null; uf: string | null;
    volumes: number; pesoBruto: number; pesoLiquido: number };
  baseIcms: number; baseIcmsSt: number;
  /** Demais totais da aba Impostos do Elevor: FCP, desonerado, CBS/IBS, serviços e retenções. */
  impostos: Record<string, number>;
};

const desfazer = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const exp = (nome: string, flags = '') => new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, flags);
/** Primeiro <nome>valor</nome> do trecho (ignora prefixo de namespace). */
function tag(trecho: string | null | undefined, nome: string): string | null {
  const m = trecho ? trecho.match(exp(nome)) : null;
  return m ? desfazer(m[1].trim()) : null;
}
const blocos = (trecho: string, nome: string) => [...trecho.matchAll(exp(nome, 'g'))].map((m) => m[0]);
const n = (v: string | null) => (v ? Number(v) : 0);
export const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Lê a NF-e; lança Error com a explicação quando o arquivo não serve. */
export function lerNfe(xml: string): Nfe {
  const inf = blocos(xml, 'infNFe')[0];
  if (!inf) throw new Error('O arquivo não é um XML de NF-e (não achei <infNFe>).');
  const chave = (inf.match(/Id="(?:NFe)?(\d{44})"/) ?? [])[1] ?? null;
  const ide = blocos(inf, 'ide')[0];
  const emit = blocos(inf, 'emit')[0];
  const dest = blocos(inf, 'dest')[0];
  const ender = blocos(emit ?? '', 'enderEmit')[0];
  const total = blocos(inf, 'ICMSTot')[0];
  const transp = blocos(inf, 'transp')[0] ?? '';
  const transporta = blocos(transp, 'transporta')[0];
  const veiculo = blocos(transp, 'veicTransp')[0];
  const vols = blocos(transp, 'vol');
  const emissao = (tag(ide, 'dhEmi') ?? tag(ide, 'dEmi') ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(emissao)) throw new Error('XML sem data de emissão.');
  const itens = blocos(inf, 'det').map((det): ItemNfe => {
    const prod = blocos(det, 'prod')[0];
    const imp = blocos(det, 'imposto')[0] ?? '';
    const icms = blocos(imp, 'ICMS')[0];
    const ipi = blocos(imp, 'IPI')[0];
    const pis = blocos(imp, 'PIS')[0];
    const cofins = blocos(imp, 'COFINS')[0];
    const cst = tag(icms, 'CST') ?? tag(icms, 'CSOSN');
    const ean = tag(prod, 'cEAN');
    return {
      item: Number((det.match(/nItem="(\d+)"/) ?? [])[1] ?? 0), codigo: tag(prod, 'cProd') ?? '', ean: ean && /^\d{8,14}$/.test(ean) ? ean : null,
      descricao: tag(prod, 'xProd') ?? '', ncm: tag(prod, 'NCM'), cfop: tag(prod, 'CFOP'), unidade: tag(prod, 'uCom'),
      quantidade: n(tag(prod, 'qCom')), valorUnitario: n(tag(prod, 'vUnCom')), valorTotal: n(tag(prod, 'vProd')), desconto: n(tag(prod, 'vDesc')),
      ipi: n(tag(ipi, 'vIPI')), icms: n(tag(icms, 'vICMS')), icmsSt: n(tag(icms, 'vICMSST')),
      cst: cst ? `${tag(icms, 'orig') ?? ''}${cst}` : null, baseIcms: n(tag(icms, 'vBC')), aliqIcms: n(tag(icms, 'pICMS')), aliqIpi: n(tag(ipi, 'pIPI')),
      baseSt: n(tag(icms, 'vBCST')), aliqSt: n(tag(icms, 'pICMSST')), baseFcpSt: n(tag(icms, 'vBCFCPST')), aliqFcpSt: n(tag(icms, 'pFCPST')),
      fcpSt: n(tag(icms, 'vFCPST')), cstPis: tag(pis, 'CST'), aliqPis: n(tag(pis, 'pPIS')), pis: n(tag(pis, 'vPIS')),
      cstCofins: tag(cofins, 'CST'), aliqCofins: n(tag(cofins, 'pCOFINS')), cofins: n(tag(cofins, 'vCOFINS')),
    };
  });
  if (!itens.length) throw new Error('XML sem itens.');
  const duplicatas = blocos(inf, 'dup')
    .map((d) => ({ numero: tag(d, 'nDup') ?? '', vencimento: (tag(d, 'dVenc') ?? '').slice(0, 10), valor: n(tag(d, 'vDup')) }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) && d.valor > 0);
  const adic = blocos(inf, 'infAdic')[0];
  const ibs = blocos(inf, 'IBSCBSTot')[0];
  const iss = blocos(inf, 'ISSQNtot')[0];
  const ret = blocos(inf, 'retTrib')[0];
  return {
    chave, numero: Number(tag(ide, 'nNF') ?? 0), serie: tag(ide, 'serie'), modelo: tag(ide, 'mod') ?? '55', emissao, natureza: tag(ide, 'natOp'),
    emitente: { documento: soDigitos(tag(emit, 'CNPJ') ?? tag(emit, 'CPF')), nome: tag(emit, 'xNome') ?? '', municipio: tag(ender, 'xMun'), uf: tag(ender, 'UF') },
    destinatario: { documento: soDigitos(tag(dest, 'CNPJ') ?? tag(dest, 'CPF')) || null, nome: tag(dest, 'xNome') },
    itens,
    totais: {
      produtos: n(tag(total, 'vProd')), frete: n(tag(total, 'vFrete')), seguro: n(tag(total, 'vSeg')), desconto: n(tag(total, 'vDesc')),
      outros: n(tag(total, 'vOutro')), ipi: n(tag(total, 'vIPI')), icms: n(tag(total, 'vICMS')), icmsSt: n(tag(total, 'vST')), total: n(tag(total, 'vNF')),
    },
    duplicatas,
    informacoes: tag(adic, 'infCpl'),
    informacoesFisco: tag(adic, 'infAdFisco'),
    transporte: {
      modalidade: tag(transp, 'modFrete'), documento: soDigitos(tag(transporta, 'CNPJ') ?? tag(transporta, 'CPF')) || null, nome: tag(transporta, 'xNome'),
      placa: tag(veiculo, 'placa'), uf: tag(veiculo, 'UF'),
      volumes: vols.reduce((t, v) => t + n(tag(v, 'qVol')), 0), pesoBruto: vols.reduce((t, v) => t + n(tag(v, 'pesoB')), 0),
      pesoLiquido: vols.reduce((t, v) => t + n(tag(v, 'pesoL')), 0),
    },
    baseIcms: n(tag(total, 'vBC')), baseIcmsSt: n(tag(total, 'vBCST')),
    impostos: {
      fcp: n(tag(total, 'vFCP')), fcpSt: n(tag(total, 'vFCPST')), fcpUfDestino: n(tag(total, 'vFCPUFDest')), icmsDesonerado: n(tag(total, 'vICMSDeson')),
      baseCbsIbs: n(tag(ibs, 'vBCIBSCBS')), cbs: n(tag(ibs, 'vCBS')), ibs: n(tag(ibs, 'vIBS')),
      iss: n(tag(iss, 'vISS')), baseIss: n(tag(iss, 'vBC')), issRetido: n(tag(iss, 'vISSRet')),
      pisRetido: n(tag(ret, 'vRetPIS')), cofinsRetido: n(tag(ret, 'vRetCOFINS')), csllRetido: n(tag(ret, 'vRetCSLL')),
      baseIrrf: n(tag(ret, 'vBCIRRF')), irrf: n(tag(ret, 'vIRRF')), baseInss: n(tag(ret, 'vBCRetPrev')), inss: n(tag(ret, 'vRetPrev')),
    },
  };
}
