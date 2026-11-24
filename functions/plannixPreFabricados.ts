import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { db } from './firebaseAdmin.js';
import { veArea } from './credenciais.js';

// Pré-fabricados de cada LOTE no detalhe da obra (WEB /engenharia/obras/:id), lidos do Plannix (sistema de produção da
// fábrica). No Plannix, cada LOTE nosso é uma "obra" própria, ligada pelo número do pedido: a coluna "Nº Pedido/Cód.
// Auxiliar" dos LOTEs no Friday (subitens do GESTÃO DE OBRAS) tem o mesmo número que o "Cód. Auxiliar" (`codAuxiliarObra`)
// da obra no Plannix, preenchido à mão lá. Para cada LOTE ligado: as peças do projeto agrupadas pelo nome (ex.: P01 com
// 10 peças), cada uma com o código de controle e a etapa atual; sem projeto cadastrado, as linhas do Lançamento Final.
// A chave da API fica no secret PLANNIX_API_KEY (nunca no navegador).
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/05_PLANNIX.md.
type AnyRecord = Record<string, any>;

export const plannixApiKey = defineSecret('PLANNIX_API_KEY');
const BASE = 'https://api.plannix.com.br/public/v1/bi';
const MAX_LOTES = 30;
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
/** Por LOTE da obra que tem Nº Pedido no Friday; `erro`: nenhuma obra do Plannix com esse Cód. Auxiliar, ou mais de uma. */
export type LotePlannix =
  | { lote: string; pedido: string; codigo: number; sigla: string; nome: string; projeto: boolean; itens: ItemPlannix[] }
  | { lote: string; pedido: string; erro: 'nao-encontrada' }
  | { lote: string; pedido: string; erro: 'duplicada'; codigos: number[] };

export interface PlannixStore {
  getEmployee(uid: string): Promise<AnyRecord | undefined>;
  /** Nº Pedido de cada LOTE da obra (chave do LOTE → célula da coluna "Nº Pedido/Cód. Auxiliar" no Friday). */
  getPedidos(obraId: string): Promise<Record<string, unknown>>;
  /** GET em `${BASE}/${rota}` com os parâmetros; devolve o JSON (null quando a API responde null). */
  get(rota: string, parametros?: Record<string, string>): Promise<unknown>;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v == null ? '' : String(v).trim());
const lista = (v: unknown): AnyRecord[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
const comparar = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare;

/** Contrato (obras-v2) pedido pela tela. */
export function obraIdValido(dados: unknown): string {
  const obraId = (dados as AnyRecord | null)?.obraId;
  if (typeof obraId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(obraId)) throw new HttpsError('invalid-argument', 'Informe a obra.');
  return obraId;
}

/** Título da coluna do pedido nos LOTEs do Friday ("Nº Pedido/Cód. Auxiliar"). */
export const COLUNA_PEDIDO = /^n\s*[º°o.]?\s*pedido/i;

/** Célula de link do Friday ({ url, texto }, ex.: texto "816" e o pedido no Elevor) → o número do pedido; '' sem valor. */
export function pedidoDaCelula(valor: unknown): string {
  if (valor == null) return '';
  if (typeof valor !== 'object') return texto(valor);
  const v = valor as AnyRecord;
  return texto(v.texto) || texto(String(v.url ?? '').match(/[?&]Cod=([^&#]+)/i)?.[1]);
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
    const obraId = obraIdValido(dados);
    const pedidos = Object.entries(await store.getPedidos(obraId))
      .map(([lote, celula]) => ({ lote, pedido: pedidoDaCelula(celula) }))
      .filter((p) => p.pedido)
      .slice(0, MAX_LOTES);
    if (!pedidos.length) return { lotes: [] };

    // Cadastro de obras do Plannix (o período largo pega todas): Cód. Auxiliar → obras.
    const obras = lista(await store.get('obras', { dataInicial: '2000-01-01', dataFinal: '2100-12-31' }));
    const porPedido = new Map<string, AnyRecord[]>();
    for (const o of obras) {
      const aux = texto(o.codAuxiliarObra);
      if (aux && Number.isInteger(Number(o.codObra))) porPedido.set(aux, [...(porPedido.get(aux) ?? []), o]);
    }
    const ligadas = pedidos.map((p) => ({ ...p, obras: porPedido.get(p.pedido) ?? [] }));
    const siglas = [...new Set(ligadas.filter((l) => l.obras.length === 1).map((l) => texto(l.obras[0].siglaObra)).filter(Boolean))];

    const porSigla = new Map<string, { pecas: AnyRecord[]; status: AnyRecord[]; lancamentos: AnyRecord[] | null }>();
    await Promise.all(siglas.map(async (sigla) => {
      const [pecas, status] = await Promise.all([
        store.get('informacaoGlobalPeca', { siglaObra: sigla }),
        store.get('exportaStatusProducao', { sigla }),
      ]);
      porSigla.set(sigla, { pecas: lista(pecas), status: lista(status), lancamentos: null });
    }));

    const lotes: LotePlannix[] = [];
    for (const { lote, pedido, obras: achadas } of ligadas) {
      if (achadas.length > 1) { lotes.push({ lote, pedido, erro: 'duplicada', codigos: achadas.map((o) => Number(o.codObra)).sort((a, b) => a - b) }); continue; }
      const obra = achadas[0];
      const sigla = texto(obra?.siglaObra);
      const dadosSigla = porSigla.get(sigla);
      if (!obra || !dadosSigla) { lotes.push({ lote, pedido, erro: 'nao-encontrada' }); continue; }
      const codigo = Number(obra.codObra);
      const nome = texto(obra.nomeObra);
      let itens = itensDasPecas(dadosSigla.pecas, dadosSigla.status, nome);
      const projeto = itens.length > 0;
      if (!projeto) {
        dadosSigla.lancamentos ??= lista(await store.get('lancamentoInicialeFinal', { sigla, fase: 'Final' }));
        itens = itensDoLancamento(dadosSigla.lancamentos, codigo);
      }
      lotes.push({ lote, pedido, codigo, sigla, nome, projeto, itens });
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
  async getPedidos(obraId) {
    // LOTEs = subitens oficiais do registro de obras-v2 (friday-cadastros); a coluna do pedido é achada pelo título.
    const registro = (await db.collection('friday-cadastros').where('colecao', '==', 'obras-v2').limit(1).get()).docs[0];
    const quadro = Number(registro?.get('subitens.quadro_id'));
    if (!registro || !quadro) return {};
    const colunas = await db.collection('friday-colunas').where('quadro_id', '==', quadro).get();
    const coluna = colunas.docs.find((c) => COLUNA_PEDIDO.test(texto(c.get('titulo'))));
    if (!coluna) return {};
    const itens = await db.collection('friday-itens').where('vinculo.id', '==', obraId).get();
    const pedidos: Record<string, unknown> = {};
    for (const item of itens.docs) {
      const i = item.data();
      if (i.vinculo?.cadastro !== registro.id || i.vinculo?.sub == null || Number(i.quadro_id) !== quadro || i.excluido_em) continue;
      pedidos[String(i.vinculo.sub)] = i.valores?.[coluna.id];
    }
    return pedidos;
  },
  get: getPlannix,
};
const service = createPlannixService(store);

export const plannixPreFabricados = onCall(
  { region: 'southamerica-east1', secrets: [plannixApiKey], timeoutSeconds: 300, memory: '512MiB' },
  (request) => service(request.auth?.uid, request.data),
);
