/**
 * Guarda de segurança para a primeira integração experimental.
 * Não cria endpoint, não lê segredos e não executa nenhuma chamada quando o
 * contrato do ERP não foi disponibilizado explicitamente ao projeto.
 */
export const ERP_API_CONTRACT_MISSING = 'ERP_API_CONTRACT_MISSING';

export const CAMPOS_DE_CONTRATO_NECESSARIOS = Object.freeze([
  'URL base do ERP',
  'endpoint de consulta de query',
  'método HTTP',
  'mecanismo de autenticação (sem expor o segredo)',
  'estrutura da resposta para as queries 46 e 47',
]);

export function criarClienteErpReadOnly() {
  const error = new Error(ERP_API_CONTRACT_MISSING);
  error.code = ERP_API_CONTRACT_MISSING;
  error.missing = CAMPOS_DE_CONTRATO_NECESSARIOS;
  throw error;
}
