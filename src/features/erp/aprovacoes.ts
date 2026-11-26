import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, type FirestoreError } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { idDaPagina, type AprovacaoPagina, type ImagemAprovacao, type SituacaoAprovacao } from './aprovacoesCore';

// erp-aprovacoes/{página}: a última decisão do financeiro sobre cada página do ERP (aprovacoesCore.ts). Rules: quem vê o
// ERP lê; quem edita o ERP grava, assinando com o próprio uid e a hora do servidor; ninguém apaga. As imagens da decisão
// (rabiscos do Canvas, prints) ficam no Storage em erp/aprovacoes/{id da página}/, com o caminho e a URL na decisão.
// The Manuscript, 01_FIRESTORE/COLECOES/erp-aprovacoes.md.

const COLECAO = 'erp-aprovacoes';

const texto = (v: unknown) => (typeof v === 'string' ? v : '');

function paraAprovacao(d: Record<string, unknown>): AprovacaoPagina | null {
  if (d.situacao !== 'aprovada' && d.situacao !== 'reprovada') return null;
  const por = d.decididoPor as { uid?: unknown; nome?: unknown } | null | undefined;
  return {
    pagina: texto(d.pagina),
    titulo: texto(d.titulo),
    situacao: d.situacao,
    descricao: texto(d.descricao) || null,
    decididoPor: por && typeof por.uid === 'string' ? { uid: por.uid, nome: texto(por.nome) } : null,
    decididoEm: d.decididoEm instanceof Timestamp ? d.decididoEm.toDate() : null,
    imagens: Array.isArray(d.imagens)
      ? (d.imagens as Array<Record<string, unknown>>).filter((i) => typeof i?.path === 'string' && typeof i?.url === 'string')
        .map((i) => ({ path: i.path as string, url: i.url as string, bytes: typeof i.bytes === 'number' ? i.bytes : 0 }))
      : [],
  };
}

/** Acompanha a decisão da página (null = ainda não decidida). */
export function ouvirAprovacao(pagina: string, aoMudar: (a: AprovacaoPagina | null) => void, aoFalhar: (e: FirestoreError) => void) {
  return onSnapshot(doc(db, COLECAO, idDaPagina(pagina)), (s) => aoMudar(s.exists() ? paraAprovacao(s.data()) : null), aoFalhar);
}

/** Sobe uma imagem da decisão (as Rules não deixam sobrescrever: o nome leva a hora). */
export async function enviarImagemAprovacao(pagina: string, imagem: Blob): Promise<ImagemAprovacao> {
  const tipo = imagem.type.startsWith('image/') ? imagem.type : 'image/png';
  const extensao = tipo === 'image/jpeg' ? 'jpg' : tipo.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'png';
  const path = `erp/aprovacoes/${idDaPagina(pagina)}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensao}`;
  const alvo = ref(storage, path);
  await uploadBytes(alvo, imagem, { contentType: tipo });
  return { path, url: await getDownloadURL(alvo), bytes: imagem.size };
}

/** Apaga a imagem do Storage (a decisão já foi gravada sem ela). Imagem que não existe mais não é erro. */
export async function apagarImagemAprovacao(path: string) {
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if ((err as { code?: string })?.code !== 'storage/object-not-found') throw err;
  }
}

/** Grava a decisão (substitui a anterior). */
export function gravarAprovacao(
  pagina: string, titulo: string, situacao: SituacaoAprovacao, descricao: string, autor: { uid: string; nome: string }, imagens: ImagemAprovacao[],
) {
  return setDoc(doc(db, COLECAO, idDaPagina(pagina)), {
    schemaVersion: 1,
    pagina,
    titulo: titulo.slice(0, 200),
    situacao,
    descricao: descricao.trim() || null,
    decididoPor: autor,
    decididoEm: serverTimestamp(),
    // Só com imagem: a decisão sem imagem continua no formato de antes (e o setDoc inteiro tira as imagens que saíram).
    ...(imagens.length ? { imagens } : {}),
  });
}
