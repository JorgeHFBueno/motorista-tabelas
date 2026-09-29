import { normalizarPlacaParaErp } from './normalizacao.mjs';
import { CAMPOS_DE_CONTRATO_NECESSARIOS, ERP_API_CONTRACT_MISSING } from './erp-client.mjs';

const request = Object.freeze({
  DataInicial: '2025-01-01',
  DataFinal: '2026-09-25',
  Placa: normalizarPlacaParaErp('JBJ-4J22'),
});

// Este módulo não faz rede. O contrato deverá ser fornecido antes de habilitar
// qualquer execução READ-ONLY das queries 46 e 47.
console.log(JSON.stringify({
  status: 'BLOQUEADO',
  code: ERP_API_CONTRACT_MISSING,
  request,
  missing: CAMPOS_DE_CONTRATO_NECESSARIOS,
}, null, 2));
