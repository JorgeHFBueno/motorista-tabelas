import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin.js';
import { temCredencial } from './credenciais.js';
import { textoCelula } from './fridayApiDominio.js';

// Pessoas do Cronograma Logístico (WEB /logistica/cronograma) tiradas de dois quadros do Friday, que a logística não lê
// pelas Rules: Motorista = todos os itens do quadro FUNCIONARIOS; Auxiliar = Banco de Currículos (nome do item e a
// coluna "Função Desejada"). Devolve só esses campos; o resto dos quadros continua fechado.
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/01_FUNCTIONS_VIGENTES.md e 03_APLICACAO_WEB/15_LOGISTICA.md.
type AnyRecord = Record<string, any>;

export const QUADRO_FUNCIONARIOS = 1793804494102624;
export const QUADRO_CURRICULOS = 1793804423534753;
export const TITULO_FUNCAO = 'Função Desejada';

export interface PessoaFriday { id: string; nome: string; funcao?: string }

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Item ativo de primeiro nível (não subitem, nem arquivado, nem na lixeira), com nome. */
const ativo = (item: AnyRecord) => !item.arquivado_em && !item.excluido_em && item.item_pai_id == null
  && typeof item.nome === 'string' && item.nome.trim() !== '';

const porNome = (a: PessoaFriday, b: PessoaFriday) => a.nome.localeCompare(b.nome, 'pt-BR');

/** Itens do quadro como pessoas; com a coluna de função, cada uma leva o texto da célula. */
export function pessoasDoQuadro(itens: AnyRecord[], colunaFuncao?: { id: number; tipo: string; config?: AnyRecord } | null): PessoaFriday[] {
  const contexto = { nomePessoa: () => '', nomeItem: () => null };
  return itens.filter(ativo).map((item) => {
    const pessoa: PessoaFriday = { id: String(item.id), nome: String(item.nome).trim().replace(/\s+/g, ' ') };
    if (colunaFuncao) {
      const funcao = textoCelula(colunaFuncao, (item.valores ?? {})[String(colunaFuncao.id)], contexto);
      if (funcao) pessoa.funcao = funcao;
    }
    return pessoa;
  }).sort(porNome);
}

/** A coluna pelo título, sem diferença de acento e maiúsculas. */
export function colunaPeloTitulo<C extends { titulo?: unknown }>(colunas: C[], titulo: string): C | null {
  return colunas.find((coluna) => typeof coluna.titulo === 'string' && semAcento(coluna.titulo) === semAcento(titulo)) ?? null;
}

export interface LogisticaPessoasStore {
  getEmployee(uid: string): Promise<AnyRecord | undefined>;
  itensDoQuadro(quadroId: number): Promise<AnyRecord[]>;
  colunasDoQuadro(quadroId: number): Promise<AnyRecord[]>;
}

export function createLogisticaPessoasService(store: LogisticaPessoasStore) {
  return async (uid: string | undefined): Promise<{ motoristas: PessoaFriday[]; auxiliares: PessoaFriday[] }> => {
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    if (!temCredencial(await store.getEmployee(uid), 'logistica', 'mecanico')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
    const [funcionarios, curriculos, colunas] = await Promise.all([
      store.itensDoQuadro(QUADRO_FUNCIONARIOS),
      store.itensDoQuadro(QUADRO_CURRICULOS),
      store.colunasDoQuadro(QUADRO_CURRICULOS),
    ]);
    const coluna = colunaPeloTitulo(colunas, TITULO_FUNCAO);
    return {
      motoristas: pessoasDoQuadro(funcionarios),
      auxiliares: pessoasDoQuadro(curriculos, coluna ? { id: Number(coluna.id), tipo: String(coluna.tipo), config: coluna.config } : null),
    };
  };
}

const service = createLogisticaPessoasService({
  async getEmployee(uid) {
    const snapshot = await db.collection('funcionarios').doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async itensDoQuadro(quadroId) {
    const snapshot = await db.collection('friday-itens').where('quadro_id', '==', quadroId).get();
    return snapshot.docs.map((doc) => doc.data());
  },
  async colunasDoQuadro(quadroId) {
    const snapshot = await db.collection('friday-colunas').where('quadro_id', '==', quadroId).get();
    return snapshot.docs.map((doc) => doc.data());
  },
});

export const logisticaPessoasFriday = onCall({ region: 'southamerica-east1' }, (request) => service(request.auth?.uid));
