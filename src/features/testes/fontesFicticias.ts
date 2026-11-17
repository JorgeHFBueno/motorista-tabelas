/**
 * /testes/mki: dados fictícios em memória para o CronoObra. Nada vai para o Firestore; recarregar a página volta
 * ao início. Nomes, contratos e mestres são inventados; as datas acompanham o dia de hoje.
 */
import type { AlocacaoFirestore, CreateAlocacao, UpdateAlocacao } from "../cronograma-obras/data/cronogramaFirestore";
import type { FontesCronograma } from "../cronograma-obras/data/fontesCronograma";
import { adaptMestresFirestore, type MestreFirestore } from "../cronograma-obras/data/mestresFirestore";
import { adaptObraV2Contract } from "../cronograma-obras/data/source/obrasV2CronogramaAdapter";
import type { ContratosChange } from "../cronograma-obras/data/source/contratosRealtime";
import { addDays, todayCivil, weekStart } from "../cronograma-obras/domain/temporal";
import { loteStatusFromCode } from "../../services/loteStatusService";

type Lote = { ordem: number; nome: string; status: string; prioridade?: number };
type Contrato = Record<string, unknown> & { lotes: Record<string, Lote> };

const MESTRES: Array<[id: string, nome: string, cor: string]> = [
  ["alberto", "ALBERTO", "6b4a2f"], ["bruno", "BRUNO", "2f6b5e"], ["carlos", "CARLOS", "3f7fa0"],
  ["daniel", "DANIEL", "765d8d"], ["eduardo", "EDUARDO", "a35a2b"], ["fabio", "FÁBIO", "496f47"],
];

function contratos(base: string): Record<string, Contrato> {
  const d = (dias: number) => addDays(base, dias);
  const lotes = (...itens: Array<[id: string, nome: string, status: string, prioridade?: number]>) =>
    Object.fromEntries(itens.map(([id, nome, status, prioridade], ordem) => [id, { ordem, nome, status, ...(prioridade === undefined ? {} : { prioridade }) }]));
  const contrato = (numero: string, nome: string, tipoObra: string, empresa: string, inicio: number, fim: number, itens: Record<string, Lote>, extra: Record<string, unknown> = {}): Contrato => ({
    friday: { ok: true }, nomeObra: nome, numeroContrato: numero, ano: Number(base.slice(0, 4)), tipoObra, empresa,
    situacao: "Obra em Andamento", dataInicial: d(inicio), dataFinal: d(fim), local: "Cidade Fictícia - RS", siglaObra: "", lotes: itens, ...extra,
  });
  return {
    "f-01": contrato("101/2026", "VALE VERDE 101/2026", "Pública", "LEDUR", -40, 80, lotes(
      ["f01-l1", "LOTE 1 - PONTE DO ARROIO AZUL - (5,00X21,00M)", "Em andamento"],
      ["f01-l2", "LOTE 2 - BUEIRO DA LINHA NOVA - (2,00X2,00M)", "Em andamento"],
      ["f01-l3", "LOTE 3 - PONTE DO RIO CLARO - (6,40X17,00M)", "Próxima a Iniciar", 1],
    )),
    "f-02": contrato("118/2026", "SERRA ALTA 118/2026", "Pública", "LEDUR", -20, 100, lotes(
      ["f02-l1", "LOTE 1 - GALERIA DA RUA DAS FLORES", "Parada"],
      ["f02-l2", "LOTE 2 - PONTE DA ESTRADA VELHA - (4,00X12,00M)", "Próxima a Iniciar", 2],
      ["f02-l3", "LOTE 3 - CABECEIRAS DA PONTE SUL", "Não iniciada"],
    )),
    "f-03": contrato("204/2026", "CONDOMÍNIO JARDIM DO SOL", "Privada", "ARTEBASE", -10, 60, lotes(
      ["f03-l1", "LOTE 1 - MUROS DE CONTENÇÃO", "Em andamento"],
      ["f03-l2", "LOTE 2 - RESERVATÓRIO", "Próxima a Iniciar"],
    )),
    "f-04": contrato("131/2026", "PORTO NOVO 131/2026", "Pública", "LEDUR", 15, 140, lotes(
      ["f04-l1", "LOTE 1 - PONTE DO ARROIO FUNDO - (5,00X15,00M)", "Não iniciada"],
      ["f04-l2", "LOTE 2 - PASSARELA DO CENTRO", "Revisar escopo"],
    )),
    "f-05": contrato("097/2025", "BOA ESPERANÇA 097/2025", "Pública", "LEDUR", -120, -5, lotes(
      ["f05-l1", "LOTE 1 - PONTE DO PASSO FUNDO", "Finalizado"],
    )),
    "f-06": contrato("212/2026", "GALPÃO INDUSTRIAL SANTA RITA", "Privada", "LEDUR", 30, 120, {}, { situacao: "Aguardando Assinatura do contrato" }),
  };
}

function alocacoes(base: string): AlocacaoFirestore[] {
  const d = (dias: number) => addDays(base, dias);
  const a = (id: string, contratoId: string, obraId: string, mestreId: string, inicio: number, tempoPlanejado: number, extra: Partial<AlocacaoFirestore> = {}): AlocacaoFirestore =>
    ({ id, contratoId, obraId, mestreId, inicio: d(inicio), tempoPlanejado, criadoPorFuncionarioId: "ficticio", ...extra });
  return [
    a("a-01", "f-01", "f01-l1", "alberto", -14, 18, { naoTrabalhados: [{ inicio: d(-6), dias: 2 }] }),
    a("a-02", "f-01", "f01-l1", "alberto", 8, 12),
    a("a-03", "f-01", "f01-l2", "bruno", -7, 25),
    a("a-04", "f-02", "f02-l1", "carlos", -21, 14),
    a("a-05", "f-03", "f03-l1", "daniel", -3, 30),
    a("a-06", "f-03", "f03-l1", "eduardo", 10, 9),
    // Conflict on purpose: BRUNO in two works on the same days.
    a("a-07", "f-02", "f02-l2", "bruno", 4, 6),
    a("a-08", "f-01", "f01-l3", "fabio", 21, 20),
  ];
}

/** Fontes do CronoObra em memória, com os dados fictícios acima. */
export function criarFontesFicticias(hoje = todayCivil()): FontesCronograma {
  const base = weekStart(hoje);
  const docs = contratos(base);
  let lista = alocacoes(base);
  const mestres = MESTRES.map(([id, nome, cor]) => ({ id, data: { nome, cor } }));
  const ouvintesContratos = new Set<(changes: ContratosChange[]) => void>();
  const ouvintesAlocacoes = new Set<(alocacoes: AlocacaoFirestore[]) => void>();
  const depois = (fn: () => void) => setTimeout(fn, 0);
  const mudanca = (id: string, type: ContratosChange["type"]): ContratosChange => {
    const diagnostics: string[] = [];
    return { type, id, contrato: adaptObraV2Contract({ id, exists: true, data: docs[id] }, diagnostics), diagnostics };
  };
  const avisarContrato = (id: string) => depois(() => ouvintesContratos.forEach((ouvir) => ouvir([mudanca(id, "modified")])));
  const avisarAlocacoes = () => depois(() => ouvintesAlocacoes.forEach((ouvir) => ouvir(lista.map((item) => ({ ...item })))));
  let sequencia = 0;

  return {
    contratos: {
      subscribe(onChanges) {
        ouvintesContratos.add(onChanges);
        depois(() => onChanges(Object.keys(docs).map((id) => mudanca(id, "added"))));
        return () => ouvintesContratos.delete(onChanges);
      },
    },
    mestres: {
      carregar: async () => adaptMestresFirestore(mestres),
      async criar(nome, cor, atuais) {
        const limpo = nome.trim().toLocaleUpperCase("pt-BR");
        if (!limpo) throw new Error("Informe um nome válido para o mestre.");
        if (atuais.some((mestre) => mestre.nome === limpo)) throw new Error("Já existe um mestre com esse nome.");
        const novo: MestreFirestore = { id: `ficticio-${++sequencia}`, nome: limpo, cor: { background: `#${cor}`, text: "#ffffff" } };
        mestres.push({ id: novo.id, data: { nome: limpo, cor } });
        return novo;
      },
    },
    alocacoes: {
      subscribeAlocacoes(onData) {
        ouvintesAlocacoes.add(onData);
        depois(() => onData(lista.map((item) => ({ ...item }))));
        return () => ouvintesAlocacoes.delete(onData);
      },
      createAlocacaoReference: (id) => ({ id: id ?? `ficticia-${Date.now()}-${++sequencia}` }),
      async createAlocacao(input: CreateAlocacao, reference) {
        const id = reference?.id ?? `ficticia-${Date.now()}-${++sequencia}`;
        lista = [...lista.filter((item) => item.id !== id), { ...input, id }];
        avisarAlocacoes();
        return id;
      },
      async updateAlocacao(id: string, patch: UpdateAlocacao) {
        lista = lista.map((item) => {
          if (item.id !== id) return item;
          const next = { ...item, ...patch };
          if ("naoTrabalhados" in patch && !patch.naoTrabalhados?.length) delete next.naoTrabalhados;
          return next;
        });
        avisarAlocacoes();
      },
      async deleteAlocacao(id: string) {
        lista = lista.filter((item) => item.id !== id);
        avisarAlocacoes();
      },
    },
    async gravarPrioridadeLote(contratoId, loteId, prioridade) {
      const lote = docs[contratoId]?.lotes[loteId];
      if (!lote) throw new Error("LOTE fictício não encontrado.");
      lote.prioridade = prioridade;
      avisarContrato(contratoId);
    },
    async gravarStatusLote(contratoId, loteId, status) {
      const lote = docs[contratoId]?.lotes[loteId];
      if (!lote) throw new Error("LOTE fictício não encontrado.");
      const gravado = loteStatusFromCode(status);
      lote.status = gravado.label;
      avisarContrato(contratoId);
      return gravado;
    },
  };
}
