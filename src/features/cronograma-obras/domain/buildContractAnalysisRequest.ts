type ContractDocument = {
  raw?: { nome?: unknown; id?: unknown; numeroContrato?: unknown};
  sincronizacao?: { boardId?: unknown };
};

const informed = (value: unknown): string => {
  if (typeof value === 'string') return value.trim() || '[não informado]';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '[não informado]';
};

/** Builds the manual, read-only request from the original monday-obras document. */
export function buildContractAnalysisRequest(contract: unknown): string {
  const document = contract && typeof contract === 'object' ? contract as ContractDocument : {};
  const nome = informed(document.raw?.nome);
  const id = informed(document.raw?.id);
  const numC = informed(document.raw?.numeroContrato);
  const boardId = informed(document.sincronizacao?.boardId);

  /**Faça o levantamento de escopo da obra "${id}", contrato "${nome}"*/
  /**return `Gostaria que fizesse uma análise do contrato "${nome}", que se encontra no item "${id}" do board "${boardId}" no Monday. Considere também os documentos e anexos relacionados disponíveis no Monday e apresente os principais pontos do contrato, obrigações, prazos, riscos, pendências e aspectos que mereçam atenção.`;*/
  return `Faça o levantamento de escopo da obra "${nome}", contrato "${numC}"`;
}
