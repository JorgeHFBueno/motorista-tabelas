import { MONDAY_BOARD_ID } from '../src/features/prazos-contratuais/data/mondayPrazosSchema';

/**
 * Documentos `monday-obras/{itemId}` no formato que a projeção grava hoje, com os dados da
 * planilha "Cronograma Prazos Contratos - Gantt.xlsx" de 19/10/2026 (entrega do Brayan).
 * IDs de item/subitem são inventados (prefixo 91.../92...). Situação vem pelo Status (fórmula, com os valores reais)
 * e Pública/Privada pelo Tipo de Obra, como na projeção real.
 */
export type FixtureSubitem = { id: string; nome: string; status: string };
export type FixtureDocument = {
  id: string;
  data: {
    raw: {
      id: string; nome: string; empresa: string | null; inicio: string | null; fim: string | null;
      tipoObra: string | null; status: string | null; ordemInicio: string | null;
      numeroContrato: string | null; ano: number | null; subitems: FixtureSubitem[];
    };
    sincronizacao: { itemId: string; boardId: string; apiVersion: string; mondayUpdatedAt: string };
  };
};

let subitemSeq = 0;
type LoteSpec = [status: string, nomes: string[]];
const lotes = (...specs: LoteSpec[]): FixtureSubitem[] => specs.flatMap(([status, nomes]) => nomes.map((nome) => ({ id: `92${String(++subitemSeq).padStart(8, '0')}`, nome, status })));

type ObraSpec = {
  nome: string; empresa: 'LEDUR' | 'ARTEBASE'; inicio?: string; fim?: string; status?: string;
  ordemInicio?: string | null; tipoObra?: 'Pública' | 'Privada'; subitems?: FixtureSubitem[];
};

let itemSeq = 0;
function obra(spec: ObraSpec): FixtureDocument {
  const id = `91${String(++itemSeq).padStart(8, '0')}`;
  const contrato = spec.nome.match(/(\d+)[/-](\d{4})/);
  return {
    id,
    data: {
      raw: {
        id, nome: spec.nome, empresa: spec.empresa, inicio: spec.inicio ?? null, fim: spec.fim ?? null,
        tipoObra: spec.tipoObra ?? 'Pública',
        status: spec.status ?? (spec.inicio && spec.fim ? 'Obra em Andamento' : 'Confirmar Recurso'),
        ordemInicio: spec.ordemInicio !== undefined ? spec.ordemInicio : (spec.inicio ? 'Ok' : null),
        numeroContrato: contrato?.[1] ?? null, ano: contrato ? Number(contrato[2]) : null,
        subitems: spec.subitems ?? [],
      },
      sincronizacao: { itemId: id, boardId: MONDAY_BOARD_ID, apiVersion: '2025-04', mondayUpdatedAt: '2026-10-19T09:00:00Z' },
    },
  };
}

export const PRAZOS_FIXTURE: FixtureDocument[] = [
  // --- Obras públicas com prazo -------------------------------------------------------
  obra({ nome: 'FONTOURA XAVIER 122/2024', empresa: 'ARTEBASE', inicio: '2024-12-02', fim: '2026-05-29' }),
  obra({ nome: 'SINIMBU 029/2025', empresa: 'ARTEBASE', inicio: '2025-06-10', fim: '2026-08-04', status: 'Obra Parada', subitems: lotes(['Não iniciada', ['Terraplenagem', 'Drenagem', 'Pavimentação']]) }),
  obra({ nome: 'ARROIO DO TIGRE 34/2026 - 45m', empresa: 'ARTEBASE', inicio: '2026-03-16', fim: '2026-09-15' }),
  obra({ nome: 'LAGOA BONITA DO SUL 16/2026', empresa: 'LEDUR', inicio: '2026-06-25', fim: '2026-09-25', subitems: lotes(['Revisar escopo', ['Ponte 12m']]) }),
  obra({ nome: 'ARROIO DO TIGRE 45/2025 - 120m', empresa: 'ARTEBASE', inicio: '2025-06-04', fim: '2026-10-13', subitems: lotes(['Em andamento', ['Ponte 120m']], ['Não iniciada', ['Demolição', 'Terra', 'Guarda-corpo']]) }),
  obra({ nome: 'SÃO VENDELINO 079/2024', empresa: 'ARTEBASE', inicio: '2024-09-12', fim: '2026-10-17' }),
  obra({ nome: 'PAIM FILHO 062/2026', empresa: 'LEDUR', inicio: '2026-07-02', fim: '2026-11-02', subitems: lotes(['Em andamento', ['Galeria celular']], ['Não iniciada', ['Placa de obra', 'Máquina']]) }),
  obra({ nome: 'ARVOREDO - SC 032/2026', empresa: 'ARTEBASE', inicio: '2026-06-03', fim: '2026-11-03' }),
  obra({ nome: 'CARLOS GOMES 181/2026', empresa: 'LEDUR', inicio: '2026-08-10', fim: '2026-11-10', subitems: lotes(['Em andamento', ['Lote 01 - Ponte 18m', 'Lote 02 - Bueiro']], ['Revisar escopo', ['Lote 03 - Galeria']]) }),
  obra({ nome: 'PALMARES DO SUL 104/2026', empresa: 'LEDUR', inicio: '2026-07-27', fim: '2026-11-24', subitems: lotes(['Não iniciada', ['Cabeceiras', 'Aterro', 'Sinalização']]) }),
  obra({ nome: 'COQUEIROS DO SUL 070/2026', empresa: 'LEDUR', inicio: '2026-09-01', fim: '2026-11-30', subitems: lotes(['Não iniciada', ['Lote 01', 'Lote 02', 'Lote 03']]) }),
  obra({ nome: 'IBIRUBÁ 139/2026', empresa: 'LEDUR', inicio: '2026-08-17', fim: '2026-12-17' }),
  obra({ nome: 'IBARAMA 048/2025', empresa: 'ARTEBASE', inicio: '2026-01-13', fim: '2027-01-13', subitems: lotes(['Finalizado', ['Ponte 30m']], ['Não iniciada', ['Demolição']]) }),
  obra({ nome: 'DR. MAURÍCIO CARDOSO 372/2026', empresa: 'LEDUR', inicio: '2026-08-28', fim: '2027-02-26', subitems: lotes(['Revisar escopo', ['Galeria 01', 'Galeria 02', 'Galeria 03', 'Galeria 04', 'Galeria 05', 'Galeria 06', 'Galeria 07']]) }),
  obra({ nome: 'PASSA SETE 058/2025', empresa: 'ARTEBASE', inicio: '2026-03-06', fim: '2027-03-01', subitems: lotes(['Parada', ['Ponte 40m']]) }),
  obra({ nome: 'FLORIANO PEIXOTO 141/2026', empresa: 'LEDUR', inicio: '2026-09-09', fim: '2027-03-05', ordemInicio: null, subitems: lotes(['Revisar escopo', ['Ponte 30m']]) }),
  obra({ nome: 'SANTA MARGARIDA DO SUL 042/2026', empresa: 'LEDUR', inicio: '2026-10-13', fim: '2027-04-09' }),
  obra({ nome: 'INHACORÁ 35/2026', empresa: 'LEDUR', inicio: '2026-09-10', fim: '2027-09-07', subitems: lotes(['Revisar escopo', ['Lote 01', 'Lote 02', 'Lote 03']]) }),
  obra({ nome: 'DOIS IRMÃOS DAS MISSÕES 46/2026', empresa: 'LEDUR', inicio: '2026-09-15', fim: '2027-09-10', subitems: lotes(['Finalizado', ['Lote 01']], ['Em andamento', ['Lote 02', 'Lote 03']], ['Não iniciada', ['Lote 04', 'Lote 05']]) }),
  obra({ nome: 'MOSTARDAS 137/2025', empresa: 'ARTEBASE', inicio: '2026-10-01', fim: '2027-10-01', subitems: lotes(['Revisar escopo', ['Ponte 85m']]) }),
  // --- Obras públicas sem data (aguardando ordem de início) ----------------------------
  obra({ nome: 'IBIRAPUITÃ 32/2026', empresa: 'LEDUR' }),
  obra({ nome: 'PASSA SETE 032/2026', empresa: 'LEDUR', status: 'Aguardando Confirmação do Recurso', ordemInicio: 'Ok' }),
  obra({ nome: 'BARROS CASSAL 156/2026', empresa: 'LEDUR' }),
  obra({ nome: 'SEGREDO 175/2026', empresa: 'ARTEBASE' }),
  obra({ nome: 'ALEGRIA 147/2026', empresa: 'LEDUR', subitems: lotes(['Revisar escopo', ['Lote 01', 'Lote 02', 'Lote 03']]) }),
  obra({ nome: 'SÃO VENDELINO 64/2026', empresa: 'LEDUR', subitems: lotes(['Revisar escopo', ['Lote 01']]) }),
  // --- Ficam fora da tela (Entregue / Finalizada) ---------------------------------------
  obra({ nome: 'ACIEPP PONTE PRETA', empresa: 'LEDUR', inicio: '2025-11-03', fim: '2026-07-31', status: 'Solicitar termo Definitivo', subitems: lotes(['Finalizado', ['Ponte 24m']]) }),
  obra({ nome: 'SOBRADINHO 01/2025', empresa: 'ARTEBASE', inicio: '2025-04-01', fim: '2026-03-30', status: 'Solicitar termo Definitivo', subitems: lotes(['Finalizado', ['Ponte 20m']], ['Revisar escopo', ['Lote 02', 'Lote 03', 'Lote 04', 'Lote 05']]) }),
  // --- Obras privadas (só com o filtro "incluir obras privadas") ------------------------
  obra({ nome: 'CONDOMÍNIO VALE VERDE - PONTE 15m', empresa: 'LEDUR', inicio: '2026-08-03', fim: '2026-12-18', tipoObra: 'Privada', subitems: lotes(['Em andamento', ['Ponte 15m']]) }),
  obra({ nome: 'AGROPECUÁRIA SANTA FÉ - BUEIROS', empresa: 'ARTEBASE', inicio: '2026-10-05', fim: '2027-05-28', tipoObra: 'Privada', subitems: lotes(['Próxima a Iniciar', ['Bueiro 01', 'Bueiro 02']]) }),
];
