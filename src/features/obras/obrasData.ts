import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref as refArquivo, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { normalizarAtividade, type AtividadeV2 } from '../../services/atividade-normalizer';
import { normalizarMovimentoCombustivel, type NormalizedCombustivel } from '../../services/combustivel-normalizer';
import { CRONOGRAMA_COLLECTION } from '../cronograma-obras/data/cronogramaFirestore';
import { MESTRES_COLLECTION } from '../cronograma-obras/data/mestresFirestore';
import { lerNaoTrabalhados } from '../cronograma-obras/domain/naoTrabalhados';
import { lerApoio } from '../cronograma-obras/domain/apoio';
import { localDaCidade, obraDetalheFromV2, type AlocacaoObra, type CampoEditavelObra, type LoteObra, type ObraDetalhe } from './obrasDomain';
import { LOCAIS_SUGERIDOS } from './locaisSugeridos';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { preFabricadosDoPlannix, type LotePlannix, type PdfGravado, type PreFabricadosDoLote } from './preFabricados';
import { localDoMaps } from '../cronograma-logistica/data/logisticaFirestore';
import { idDaSincronizacao, sincronizacaoDoDocumento, type SincronizacaoPlannix } from './sincronizacaoPlannix';
import { linkDoMapa } from '../cronograma-logistica/domain/local';

const OBRAS_V2 = 'obras-v2';

/**
 * Pré-fabricados de cada LOTE da obra (chave do LOTE → itens ou aviso), lidos do Plannix pela Function
 * plannixPreFabricados (a chave da API fica num secret): ela lê o Nº Pedido de cada LOTE no Friday e acha a obra do
 * Plannix com o mesmo Cód. Auxiliar.
 */
export async function carregarPreFabricados(obra: Pick<ObraDetalhe, 'id' | 'lotes'>): Promise<Record<string, PreFabricadosDoLote>> {
  const resultado = await httpsCallable<{ obraId: string }, { lotes: LotePlannix[] }>(functions, 'plannixPreFabricados', { timeout: 300_000 })({ obraId: obra.id });
  return preFabricadosDoPlannix(obra.lotes, resultado.data.lotes);
}

// PDFs dos pré-fabricados (The Manuscript, 01_FIRESTORE/COLECOES/obras-pre-fabricados-pdfs.md): um documento por PDF,
// com o arquivo em obras/pre-fabricados/{obraId}/. Substituir troca o arquivo do mesmo documento (sem nova revisão).
const PDFS_PRE_FABRICADOS = 'obras-pre-fabricados-pdfs';
const LIMITE_PDF = 25 * 1024 * 1024;
type Autor = { uid: string; nome: string };
/** `parte`: 'console' no PDF do console; sem o campo, o PDF principal. */
type AlvoPdf = { obraId: string; lote: string; plannix: number; item: string; parte?: 'console' };

export async function carregarPdfsPreFabricados(obraId: string): Promise<PdfGravado[]> {
  const snapshot = await getDocs(query(collection(db, PDFS_PRE_FABRICADOS), where('obraId', '==', obraId)));
  return snapshot.docs.map((item) => {
    const d = item.data();
    return {
      id: item.id,
      nome: String(d.nome ?? ''),
      tamanho: Number(d.tamanho) || 0,
      anexadoEm: d.anexadoEm instanceof Timestamp ? d.anexadoEm.toDate() : new Date(0),
      anexadoPor: String(d.anexadoPor?.nome ?? ''),
      url: null,
      caminho: String(d.caminho ?? ''),
      lote: String(d.lote ?? ''),
      plannix: Number(d.plannix) || 0,
      item: String(d.item ?? ''),
      ...(d.parte === 'console' ? { parte: 'console' as const } : {}),
    };
  });
}

/** Envia o PDF para o Storage; devolve o caminho, o nome (até 200 caracteres) e o tamanho. */
async function enviarPdf(obraId: string, arquivo: File) {
  const ehPdf = arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf');
  if (!ehPdf) throw new Error(`“${arquivo.name}” não é PDF.`);
  if (arquivo.size > LIMITE_PDF) throw new Error(`“${arquivo.name}” passa de 25 MB, o limite por arquivo.`);
  const nome = arquivo.name.slice(0, 200);
  const caminho = `obras/pre-fabricados/${obraId}/${Date.now()}-${nome.replace(/[/\\]/g, '_')}`;
  await uploadBytes(refArquivo(storage, caminho), arquivo, { contentType: 'application/pdf', contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(nome)}` });
  return { caminho, nome, tamanho: arquivo.size };
}

const apagarArquivo = (caminho: string) => deleteObject(refArquivo(storage, caminho)).catch((err) => console.warn('PDF não apagado do Storage', caminho, err));

/** Anexar e Revisão: um PDF novo (uma revisão a mais) no item. */
export async function anexarPdfPreFabricado(alvo: AlvoPdf, arquivo: File, autor: Autor): Promise<void> {
  const enviado = await enviarPdf(alvo.obraId, arquivo);
  try {
    await addDoc(collection(db, PDFS_PRE_FABRICADOS), { schemaVersion: 1, ...alvo, ...enviado, anexadoPor: autor, anexadoEm: serverTimestamp() });
  } catch (err) {
    await apagarArquivo(enviado.caminho);
    throw err;
  }
}

/** Substituir: o PDF atual do item passa a ser o novo arquivo, sem nova revisão; o arquivo antigo sai do Storage. */
export async function substituirPdfPreFabricado(obraId: string, atual: PdfGravado, arquivo: File, autor: Autor): Promise<void> {
  const enviado = await enviarPdf(obraId, arquivo);
  try {
    await updateDoc(doc(db, PDFS_PRE_FABRICADOS, atual.id), { ...enviado, anexadoPor: autor, anexadoEm: serverTimestamp() });
  } catch (err) {
    await apagarArquivo(enviado.caminho);
    throw err;
  }
  await apagarArquivo(atual.caminho);
}

/** Excluir: sai das revisões e do Storage. */
export async function excluirPdfPreFabricado(pdf: PdfGravado): Promise<void> {
  await deleteDoc(doc(db, PDFS_PRE_FABRICADOS, pdf.id));
  await apagarArquivo(pdf.caminho);
}

export const enderecoDoPdf = (caminho: string) => getDownloadURL(refArquivo(storage, caminho));

// Sincronizar com o Plannix (sincronizacaoPlannix.ts): a fila do robô, um documento por LOTE.
const SINCRONIZACOES = 'plannix-sincronizacoes';

/** As sincronizações dos LOTEs da obra, ao vivo (pela chave do LOTE); devolve o cancelamento da escuta. */
export function ouvirSincronizacoes(obraId: string, aoMudar: (porLote: Record<string, SincronizacaoPlannix>) => void, aoFalhar: (err: unknown) => void) {
  return onSnapshot(query(collection(db, SINCRONIZACOES), where('obraId', '==', obraId)), (snapshot) => {
    const porLote: Record<string, SincronizacaoPlannix> = {};
    for (const item of snapshot.docs) {
      const s = sincronizacaoDoDocumento(item.id, item.data());
      if (s) porLote[s.lote] = s;
    }
    aoMudar(porLote);
  }, aoFalhar);
}

/** Pede (ou pede de novo, depois de terminada): o documento volta inteiro a 'pedido'. */
export function pedirSincronizacao(alvo: { obraId: string; lote: string; pedido: string; plannix: number }, autor: Autor) {
  return setDoc(doc(db, SINCRONIZACOES, idDaSincronizacao(alvo.obraId, alvo.lote)), {
    schemaVersion: 1, ...alvo, status: 'pedido', pedidoPor: autor, pedidoEm: serverTimestamp(), atualizadoEm: serverTimestamp(),
  });
}

export const aprovarSincronizacao = (id: string, autor: Autor) =>
  updateDoc(doc(db, SINCRONIZACOES, id), { status: 'aprovado', aprovadoPor: autor, aprovadoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });

export const cancelarSincronizacao = (id: string, autor: Autor) =>
  updateDoc(doc(db, SINCRONIZACOES, id), { status: 'cancelado', canceladoPor: autor, canceladoEm: serverTimestamp(), atualizadoEm: serverTimestamp() });

export async function listarObras(): Promise<ObraDetalhe[]> {
  const snapshot = await getDocs(collection(db, OBRAS_V2));
  return snapshot.docs
    .map((item) => obraDetalheFromV2(item.id, item.data()))
    .filter((obra): obra is ObraDetalhe => obra !== null);
}

export async function carregarObra(id: string): Promise<ObraDetalhe | null> {
  const snapshot = await getDoc(doc(db, OBRAS_V2, id));
  return snapshot.exists() ? obraDetalheFromV2(snapshot.id, snapshot.data()) : null;
}

/**
 * Grava um campo só: `local` é obrigatório; `siglaObra` (o "Sinônimo") pode ficar vazio. Os registros já feitos
 * guardam o local e a sigla da época em `id_obra_snap`.
 */
export async function gravarCampoObra(id: string, campo: CampoEditavelObra, valor: string): Promise<string> {
  const limpo = valor.trim();
  if (campo === 'local' && !limpo) throw new Error('O local não pode ficar vazio.');
  await updateDoc(doc(db, OBRAS_V2, id), { [campo]: limpo });
  return limpo;
}

const alocacaoDe = (item: { id: string; data: () => Record<string, unknown> }): AlocacaoObra => {
  const data = item.data();
  const naoTrabalhados = lerNaoTrabalhados(data.naoTrabalhados);
  const apoio = lerApoio(data.apoio);
  return {
    id: item.id,
    mestreId: typeof data.mestreId === 'string' ? data.mestreId : '',
    ...(typeof data.obraId === 'string' ? { obraId: data.obraId } : {}),
    ...(typeof data.contratoId === 'string' ? { contratoId: data.contratoId } : {}),
    inicio: typeof data.inicio === 'string' ? data.inicio : '',
    tempoPlanejado: typeof data.tempoPlanejado === 'number' ? data.tempoPlanejado : 0,
    ...(naoTrabalhados ? { naoTrabalhados } : {}),
    ...(apoio ? { apoio } : {}),
  };
};

/** Alocações do CronoObra nesta obra (inclusive os apoios que ela recebeu). */
export async function carregarAlocacoesDaObra(contratoId: string): Promise<AlocacaoObra[]> {
  const snapshot = await getDocs(query(collection(db, CRONOGRAMA_COLLECTION), where('contratoId', '==', contratoId)));
  return snapshot.docs.map(alocacaoDe);
}

/** Apoios que mestres desta obra deram a outras ("ajuda por fora"): `contratoId` de cada um é a obra ajudada. */
export async function carregarApoiosPrestados(contratoId: string): Promise<AlocacaoObra[]> {
  const snapshot = await getDocs(query(collection(db, CRONOGRAMA_COLLECTION), where('apoio.contratoId', '==', contratoId)));
  return snapshot.docs.map(alocacaoDe);
}

/** `nomeObra` de alguns contratos de obras-v2 (para "Prestou apoio …, Obra …"). */
export async function carregarNomesDeObras(ids: string[]): Promise<Record<string, string>> {
  const docs = await Promise.all([...new Set(ids)].map((id) => getDoc(doc(db, OBRAS_V2, id))));
  return Object.fromEntries(docs.map((item) => [item.id, typeof item.data()?.nomeObra === 'string' ? item.data()!.nomeObra : item.id]));
}

export async function carregarNomesMestres(): Promise<Record<string, string>> {
  const snapshot = await getDocs(collection(db, MESTRES_COLLECTION));
  return Object.fromEntries(snapshot.docs.map((item) => [item.id, typeof item.data().nome === 'string' ? item.data().nome : item.id]));
}

export async function carregarAtividadesDaObra(obraId: string): Promise<AtividadeV2[]> {
  const snapshot = await getDocs(query(collection(db, 'atividades'), where('id_obra', '==', obraId)));
  return snapshot.docs.map((item) => normalizarAtividade(item.data(), item.id));
}

export async function carregarCombustivelDaObra(obraId: string): Promise<NormalizedCombustivel[]> {
  const snapshot = await getDocs(query(collection(db, '03-combustivel'), where('id_obra', '==', obraId)));
  return snapshot.docs.map((item) => normalizarMovimentoCombustivel(item.data(), item.id));
}

const cidadesLidas = new Map<string, Promise<string | null>>();

/**
 * Locais "Cidade - UF" dos LOTEs com coordenada, sem repetir: a cidade e o estado vêm da Function logisticaLocal (a
 * mesma do Local do Cronograma Logístico), um LOTE de cada vez. LOTE que falha fica de fora.
 */
export async function locaisDosLotes(lotes: readonly LoteObra[]): Promise<string[]> {
  const locais: string[] = [];
  for (const { coordenada } of lotes) {
    if (!coordenada) continue;
    const chave = `${coordenada.lat},${coordenada.lng}`;
    if (!cidadesLidas.has(chave)) {
      cidadesLidas.set(chave, localDoMaps(linkDoMapa(coordenada))
        .then(({ cidade, uf }) => localDaCidade(cidade, uf, LOCAIS_SUGERIDOS))
        .catch((err) => { console.warn('Cidade do LOTE não lida', err); cidadesLidas.delete(chave); return null; }));
    }
    const local = await cidadesLidas.get(chave)!;
    if (local && !locais.includes(local)) locais.push(local);
  }
  return locais;
}
