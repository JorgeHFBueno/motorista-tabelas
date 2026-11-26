import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp, type FirestoreError } from 'firebase/firestore';
import { db } from '../../firebase';
import { idDaPagina, type AprovacaoPagina, type SituacaoAprovacao } from './aprovacoesCore';

// erp-aprovacoes/{página}: a última decisão do financeiro sobre cada página do ERP (aprovacoesCore.ts). Rules: quem vê o
// ERP lê; quem edita o ERP grava, assinando com o próprio uid e a hora do servidor; ninguém apaga.
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
  };
}

/** Acompanha a decisão da página (null = ainda não decidida). */
export function ouvirAprovacao(pagina: string, aoMudar: (a: AprovacaoPagina | null) => void, aoFalhar: (e: FirestoreError) => void) {
  return onSnapshot(doc(db, COLECAO, idDaPagina(pagina)), (s) => aoMudar(s.exists() ? paraAprovacao(s.data()) : null), aoFalhar);
}

/** Grava a decisão (substitui a anterior). */
export function gravarAprovacao(pagina: string, titulo: string, situacao: SituacaoAprovacao, descricao: string, autor: { uid: string; nome: string }) {
  return setDoc(doc(db, COLECAO, idDaPagina(pagina)), {
    schemaVersion: 1,
    pagina,
    titulo: titulo.slice(0, 200),
    situacao,
    descricao: descricao.trim() || null,
    decididoPor: autor,
    decididoEm: serverTimestamp(),
  });
}
