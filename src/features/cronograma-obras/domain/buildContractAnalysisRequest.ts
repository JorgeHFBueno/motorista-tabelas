const informed = (value: unknown): string => {
  if (typeof value === 'string') return value.trim() || '[não informado]';
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return '[não informado]';
};

/** Builds the manual, read-only request from the contract (obras-v2 nomeObra and numeroContrato). */
export function buildContractAnalysisRequest(contract: { nome?: unknown; numeroContrato?: unknown }): string {
  const nome = informed(contract.nome);
  const numC = informed(contract.numeroContrato);
  return `Faça o levantamento de escopo da obra "${nome}", contrato "${numC}"`;
}
