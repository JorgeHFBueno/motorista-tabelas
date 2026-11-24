import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db } from './firebaseAdmin.js';
import { veArea } from './credenciais.js';

// Pré-fabricados de cada LOTE no detalhe da obra (WEB /engenharia/obras/:id), lidos do Plannix (sistema de produção da
// fábrica). No Plannix, cada LOTE nosso é uma "obra" própria; o LOTE guarda o código dela em `obras-v2.lotes.{id}.plannix`
// (coluna "Código Plannix" dos subitens do GESTÃO DE OBRAS no Friday). Para cada código: as peças do projeto agrupadas
// pelo nome (ex.: P01 com 10 peças), cada uma com o código de controle e a etapa atual; sem projeto cadastrado, as linhas
// do Lançamento Final. A chave da API fica no secret PLANNIX_API_KEY (nunca no navegador).
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/05_PLANNIX.md.
type AnyRecord = Record<string, any>;

export const plannixApiKey = defineSecret('PLANNIX_API_KEY');
const BASE = 'https://api.plannix.com.br/public/v1/bi';
const MAX_CODIGOS = 30;
const MAX_DESENHOS = 80;

export type PecaPlannix = { codigo: string; etapa: string; data: string | null };
export type ItemPlannix = {
  produto: string;
  nome: string;
  secao: string;
  /** Peças do projeto (códigos de controle); vazio quando o item vem só do Lançamento Final. */
  pecas: PecaPlannix[];
  /** Peças previstas: as do projeto ou, sem projeto, a quantidade do Lançamento Final. */
  quantidade: number;
  /** Nomes dos desenhos (PDF) anexados à primeira peça no Plannix; a API não entrega o arquivo. */
  desenhos: string[];
};
export type LotePlannix =
  | { codigo: number; sigla: string; nome: string; projeto: boolean; itens: ItemPlannix[] }
  | { codigo: number; erro: 'nao-encontrada' };

export interface PlannixStore {
  getEmployee(uid: string): Promise<AnyRecord | undefined>;
  /** GET em `${BASE}/${rota}` com os parâmetros; devolve o JSON (null quando a API responde null). */
  get(rota: string, parametros?: Record<string, string>): Promise<unknown>;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v == null ? '' : String(v).trim());
const lista = (v: unknown): AnyRecord[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const comparar = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare;

/** Códigos de obra do Plannix pedidos pela tela: inteiros positivos, sem repetição. */
export function codigosValidos(dados: unknown): number[] {
  const bruto = (dados as AnyRecord | null)?.codigos;
  if (!Array.isArray(bruto) || !bruto.length) throw new HttpsError('invalid-argument', 'Informe os códigos Plannix dos LOTEs.');
  const codigos = [...new Set(bruto.map(Number))];
  if (codigos.some((c) => !Number.isInteger(c) || c <= 0)) throw new HttpsError('invalid-argument', 'Código Plannix inválido.');
  if (codigos.length > MAX_CODIGOS) throw new HttpsError('invalid-argument', `No máximo ${MAX_CODIGOS} LOTEs por consulta.`);
  return codigos;
}

/** "24/11/2026 09:36:00" (informacaoGlobalPeca) → "2026-11-24T09:36:00"; null quando não é data. */
const dataBr = (v: unknown) => {
  const m = texto(v).match(/^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? '00'}:${m[5] ?? '00'}:${m[6] ?? '00'}` : null;
};

/**
 * Etapa pelas datas da visão completa da peça, para a peça que não aparece em exportaStatusProducao (lá faltam, por
 * exemplo, as já expedidas de obras antigas): o último evento que tem data, da montagem para trás. Conferido em
 * 2026-11-24 nas peças que aparecem nas duas rotas: a etapa é a mesma.
 */
const EVENTOS: [string, string][] = [
  ['dataMontada', 'MONTADA'], ['data_Expedicao', 'EXPEDIDA'], ['data_Acabamento', 'ACABADA'], ['data_Concretagem', 'CONCRETAGEM'],
  ['data_Armacao', 'ARMAÇÃO'], ['data_FormaArmacao', 'ARMAÇÃO'], ['data_Forma', 'FORMA'], ['data_CorteDobra', 'CORTE DOBRA'],
  ['data_Programacao_Fabrica', 'PROGRAMADA'], ['data_Projeto', 'PROJETADA'],
];
export function etapaPelasDatas(peca: AnyRecord): { etapa: string; data: string | null } {
  if (peca.montada === true) return { etapa: 'MONTADA', data: dataBr(peca.dataMontada) };
  if (texto(peca.status_Logistica).toUpperCase() === 'EXPEDIDA' && !texto(peca.data_Expedicao)) return { etapa: 'EXPEDIDA', data: null };
  for (const [campo, etapa] of EVENTOS) if (texto(peca[campo])) return { etapa, data: dataBr(peca[campo]) };
  return { etapa: '', data: null };
}

/**
 * Peças da obra (informacaoGlobalPeca, filtrada pelo nome da obra) com a etapa atual: a de exportaStatusProducao e,
 * quando a peça não está lá, a das datas da própria peça.
 */
export function itensDasPecas(pecas: AnyRecord[], status: AnyRecord[], nomeObra: string): ItemPlannix[] {
  const etapas = new Map(status.map((s) => [texto(s.codigoControle), { etapa: texto(s.processo), data: texto(s.data) || null }]));
  const itens = new Map<string, ItemPlannix>();
  for (const p of pecas) {
    if (texto(p.nomeObra) !== nomeObra) continue;
    const codigo = texto(p.codigoControle);
    if (!codigo) continue;
    const produto = texto(p.produto) || 'Sem produto';
    const nome = texto(p.nomePeca) || codigo;
    const chave = `${produto}\u0000${nome}`;
    if (!itens.has(chave)) itens.set(chave, { produto, nome, secao: texto(p.secao), pecas: [], quantidade: 0, desenhos: [] });
    const item = itens.get(chave)!;
    const atual = etapas.get(codigo) ?? etapaPelasDatas(p);
    item.pecas.push({ codigo, etapa: atual.etapa, data: atual.data });
    item.quantidade = item.pecas.length;
  }
  for (const item of itens.values()) item.pecas.sort((a, b) => comparar(a.codigo, b.codigo));
  return [...itens.values()].sort((a, b) => comparar(a.produto, b.produto) || comparar(a.nome, b.nome));
}

/** Sem projeto cadastrado: as linhas do Lançamento Final da obra (produto, seção, comprimento e quantidade). */
export function itensDoLancamento(lancamentos: AnyRecord[], codigo: number): ItemPlannix[] {
  const obra = lancamentos.find((o) => Number(o.CodigoObra) === codigo);
  return lista(obra?.Itens)
    .filter((i) => !texto(i.Fase) || /final/i.test(texto(i.Fase)))
    .map((i) => {
      const comprimento = Number(i.Comprimento);
      const secao = texto(i.Secao);
      const nome = [texto(i.SubgrupoProduto) || texto(i.Produto), secao, comprimento > 0 ? `${comprimento.toLocaleString('pt-BR')} m` : '']
        .filter(Boolean).join(' · ');
      return { produto: texto(i.Produto) || 'Sem produto', nome, secao, pecas: [], quantidade: Number(i.QtdPecas) || 0, desenhos: [] };
    })
    .sort((a, b) => comparar(a.produto, b.produto) || comparar(a.nome, b.nome));
}

export function createPlannixService(store: PlannixStore) {
  return async (uid: string | undefined, dados: unknown): Promise<{ lotes: LotePlannix[] }> => {
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    if (!veArea(await store.getEmployee(uid), 'engenharia')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
    const codigos = codigosValidos(dados);

    // Cadastro de obras do Plannix: código → sigla e nome (o período largo pega todas).
    const obras = lista(await store.get('obras', { dataInicial: '2000-01-01', dataFinal: '2100-12-31' }));
    const porCodigo = new Map(obras.map((o) => [Number(o.codObra), o]));
    const siglas = [...new Set(codigos.map((c) => texto(porCodigo.get(c)?.siglaObra)).filter(Boolean))];

    const porSigla = new Map<string, { pecas: AnyRecord[]; status: AnyRecord[]; lancamentos: AnyRecord[] | null }>();
    await Promise.all(siglas.map(async (sigla) => {
      const [pecas, status] = await Promise.all([
        store.get('informacaoGlobalPeca', { siglaObra: sigla }),
        store.get('exportaStatusProducao', { sigla }),
      ]);
      porSigla.set(sigla, { pecas: lista(pecas), status: lista(status), lancamentos: null });
    }));

    const lotes: LotePlannix[] = [];
    for (const codigo of codigos) {
      const obra = porCodigo.get(codigo);
      const sigla = texto(obra?.siglaObra);
      const dadosSigla = porSigla.get(sigla);
      if (!obra || !dadosSigla) { lotes.push({ codigo, erro: 'nao-encontrada' }); continue; }
      const nome = texto(obra.nomeObra);
      let itens = itensDasPecas(dadosSigla.pecas, dadosSigla.status, nome);
      const projeto = itens.length > 0;
      if (!projeto) {
        dadosSigla.lancamentos ??= lista(await store.get('lancamentoInicialeFinal', { sigla, fase: 'Final' }));
        itens = itensDoLancamento(dadosSigla.lancamentos, codigo);
      }
      lotes.push({ codigo, sigla, nome, projeto, itens });
    }

    // Desenhos: os nomes dos arquivos da primeira peça de cada item (uma chamada por item; falha não derruba a tela).
    const comPecas = lotes.flatMap((l) => ('itens' in l ? l.itens.filter((i) => i.pecas.length) : [])).slice(0, MAX_DESENHOS);
    for (let k = 0; k < comPecas.length; k += 5) {
      await Promise.all(comPecas.slice(k, k + 5).map(async (item) => {
        const nomes = await store.get('ListaArquivosProjetos', { codigoControle: item.pecas[0].codigo }).catch(() => null);
        item.desenhos = Array.isArray(nomes) ? nomes.map(texto).filter(Boolean) : [];
      }));
    }
    return { lotes };
  };
}

/** Obra do cadastro do Plannix (cada LOTE nosso é uma), para escolher o Código Plannix do LOTE na tela. */
export type ObraPlannix = { codigo: number; sigla: string; nome: string; inicio: string | null; fim: string | null };

export function obrasDoCadastro(bruto: unknown): ObraPlannix[] {
  return lista(bruto)
    .map((o) => ({ codigo: Number(o.codObra), sigla: texto(o.siglaObra), nome: texto(o.nomeObra), inicio: texto(o.dataInicial) || null, fim: texto(o.dataFinal) || null }))
    .filter((o) => Number.isInteger(o.codigo) && o.codigo > 0)
    .sort((a, b) => b.codigo - a.codigo);
}

/** Cadastro de obras do Plannix (para a coluna Código Plannix do detalhe da obra): quem vê a área Engenharia. */
export function createPlannixObrasService(store: PlannixStore) {
  return async (uid: string | undefined): Promise<{ obras: ObraPlannix[] }> => {
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    if (!veArea(await store.getEmployee(uid), 'engenharia')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
    return { obras: obrasDoCadastro(await store.get('obras', { dataInicial: '2000-01-01', dataFinal: '2100-12-31' })) };
  };
}

async function getPlannix(rota: string, parametros: Record<string, string> = {}): Promise<unknown> {
  const consulta = new URLSearchParams(parametros).toString();
  const resposta = await fetch(`${BASE}/${rota}${consulta ? `?${consulta}` : ''}`, {
    headers: { Authorization: `Bearer ${plannixApiKey.value()}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(120_000), // informacaoGlobalPeca é a rota pesada: a Plannix pede 120 s ou mais
  });
  if (!resposta.ok) {
    console.error('Plannix respondeu', resposta.status, rota);
    throw new HttpsError('unavailable', `O Plannix não respondeu (${resposta.status}). Tente de novo em instantes.`);
  }
  const corpo = await resposta.text();
  return corpo ? JSON.parse(corpo) : null;
}

const store: PlannixStore = {
  async getEmployee(uid) {
    const snapshot = await db.collection('funcionarios').doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  get: getPlannix,
};
const service = createPlannixService(store);
const servicoObras = createPlannixObrasService(store);

export const plannixPreFabricados = onCall(
  { region: 'southamerica-east1', secrets: [plannixApiKey], timeoutSeconds: 300, memory: '512MiB' },
  (request) => service(request.auth?.uid, request.data),
);

export const plannixObras = onCall(
  { region: 'southamerica-east1', secrets: [plannixApiKey], timeoutSeconds: 60 },
  (request) => servicoObras(request.auth?.uid),
);
