import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { PORTAL_COLECOES, type ArquivoPortal, type PessoaRef } from './portalDominio';

// portal-noticias, team side (adm2). Contract: The Manuscript, 01_FIRESTORE/COLECOES/portal.md. Nobody deletes:
// the trash is excluidoEm/excluidoPor. The client reads only status 'publicada' with excluidoEm == null, so every
// document always has both fields. External news (origem 'externa') come from a Function and are not edited here.

export const CATEGORIAS_NOTICIA = ['economia', 'infraestrutura', 'logistica', 'inovacao', 'institucional'] as const;
export type CategoriaNoticia = (typeof CATEGORIAS_NOTICIA)[number];
export type StatusNoticia = 'publicada' | 'rascunho';
export type OrigemNoticia = 'institucional' | 'externa';

export const ROTULO_CATEGORIA_NOTICIA: Record<CategoriaNoticia, string> = {
  economia: 'Economia',
  infraestrutura: 'Infraestrutura',
  logistica: 'Logística',
  inovacao: 'Inovação',
  institucional: 'Institucional',
};

export type Noticia = {
  id: string;
  titulo: string;
  resumo: string;
  conteudo: string | null;
  url: string | null;
  imagem: ArquivoPortal | null;
  imagemUrl: string | null;
  fonte: string;
  categoria: CategoriaNoticia | null; // null: value outside the contract (the portal does not show it)
  origem: OrigemNoticia;
  status: StatusNoticia;
  destaque: boolean;
  publicadoEm: Date | null;
  criadoEm: Date | null;
  excluidoEm: Date | null;
  excluidoPor: PessoaRef | null;
};

/** What the institutional news dialog edits. */
export type NoticiaForm = {
  titulo: string;
  resumo: string;
  conteudo: string;
  url: string;
  categoria: CategoriaNoticia;
  destaque: boolean;
  status: StatusNoticia;
};

const texto = (valor: unknown) => (typeof valor === 'string' ? valor.trim() : '');
const textoOuNulo = (valor: unknown) => texto(valor) || null;
const data = (valor: unknown) => (valor instanceof Timestamp ? valor.toDate() : null);
const pessoa = (valor: unknown): PessoaRef | null => {
  const raw = valor as { uid?: unknown; nome?: unknown } | null | undefined;
  return raw && typeof raw.uid === 'string' ? { uid: raw.uid, nome: texto(raw.nome) } : null;
};
const arquivo = (valor: unknown): ArquivoPortal | null => {
  const raw = valor as Record<string, unknown> | null | undefined;
  if (!raw || typeof raw.path !== 'string' || !raw.path) return null;
  return {
    path: raw.path,
    nome: texto(raw.nome) || 'imagem',
    contentType: texto(raw.contentType),
    bytes: typeof raw.bytes === 'number' ? raw.bytes : 0,
  };
};

function paraNoticia(id: string, d: DocumentData): Noticia {
  return {
    id,
    titulo: texto(d.titulo),
    resumo: texto(d.resumo),
    conteudo: typeof d.conteudo === 'string' && d.conteudo.trim() ? d.conteudo : null,
    url: textoOuNulo(d.url),
    imagem: arquivo(d.imagem),
    imagemUrl: textoOuNulo(d.imagemUrl),
    fonte: texto(d.fonte) || (d.origem === 'externa' ? '' : 'Ledur'),
    categoria: CATEGORIAS_NOTICIA.includes(d.categoria) ? (d.categoria as CategoriaNoticia) : null,
    origem: d.origem === 'externa' ? 'externa' : 'institucional',
    status: d.status === 'publicada' ? 'publicada' : 'rascunho',
    destaque: d.destaque === true,
    publicadoEm: data(d.publicadoEm),
    criadoEm: data(d.criadoEm),
    excluidoEm: data(d.excluidoEm),
    excluidoPor: pessoa(d.excluidoPor),
  };
}

const noticias = () => collection(db, PORTAL_COLECOES.noticias);
const noticiaRef = (id: string) => doc(db, PORTAL_COLECOES.noticias, id);

/** Every news item (adm2 reads all), newest first; sorted here, no composite index. */
export function ouvirNoticias(onNext: (itens: Noticia[]) => void, onError: (erro: FirestoreError) => void) {
  return onSnapshot(
    noticias(),
    (snapshot) => {
      const itens = snapshot.docs.map((item) => paraNoticia(item.id, item.data({ serverTimestamps: 'estimate' })));
      const quando = (n: Noticia) => (n.publicadoEm ?? n.criadoEm)?.getTime() ?? 0;
      onNext(itens.sort((a, b) => quando(b) - quando(a)));
    },
    onError,
  );
}

/** Pre-generated id, so the image can be uploaded under portal/noticias/{id}/ before the document exists. */
export const novoIdNoticia = () => doc(noticias()).id;

export const urlValida = (valor: string) => {
  try {
    const url = new URL(valor.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export function validarNoticia(form: NoticiaForm): string | null {
  if (!form.titulo.trim()) return 'Informe o título.';
  if (!form.resumo.trim()) return 'Informe o resumo.';
  if (form.url.trim() && !urlValida(form.url)) return 'O link precisa começar com http:// ou https://.';
  return null;
}

const camposDoForm = (form: NoticiaForm) => ({
  titulo: form.titulo.trim(),
  resumo: form.resumo.trim(),
  conteudo: form.conteudo.trim() || null,
  url: form.url.trim() || null,
  categoria: form.categoria,
  destaque: form.destaque,
  status: form.status,
});

export async function criarNoticiaInstitucional(id: string, form: NoticiaForm, imagem: ArquivoPortal | null, autor: PessoaRef) {
  const erro = validarNoticia(form);
  if (erro) throw new Error(erro);
  await setDoc(noticiaRef(id), {
    ...camposDoForm(form),
    imagem,
    imagemUrl: null,
    fonte: 'Ledur',
    origem: 'institucional',
    publicadoEm: form.status === 'publicada' ? serverTimestamp() : null,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    criadoPor: autor,
    excluidoEm: null,
    excluidoPor: null,
  });
}

/** `imagem` undefined keeps the current image; null removes it (the file stays in Storage). */
export async function editarNoticiaInstitucional(atual: Noticia, form: NoticiaForm, imagem: ArquivoPortal | null | undefined) {
  if (atual.origem !== 'institucional') throw new Error('Notícia externa não é editada aqui.');
  const erro = validarNoticia(form);
  if (erro) throw new Error(erro);
  await updateDoc(noticiaRef(atual.id), {
    ...camposDoForm(form),
    ...(imagem !== undefined ? { imagem } : {}),
    ...(form.status === 'publicada' && !atual.publicadoEm ? { publicadoEm: serverTimestamp() } : {}),
    atualizadoEm: serverTimestamp(),
  });
}

/** Publish or unpublish (institutional or external); publicadoEm is set only the first time it is published. */
export const alterarStatusNoticia = (atual: Noticia, status: StatusNoticia) =>
  updateDoc(noticiaRef(atual.id), {
    status,
    ...(status === 'publicada' && !atual.publicadoEm ? { publicadoEm: serverTimestamp() } : {}),
    atualizadoEm: serverTimestamp(),
  });

export const moverNoticiaParaLixeira = (id: string, autor: PessoaRef) =>
  updateDoc(noticiaRef(id), { excluidoEm: serverTimestamp(), excluidoPor: autor, atualizadoEm: serverTimestamp() });

export const restaurarNoticia = (id: string) =>
  updateDoc(noticiaRef(id), { excluidoEm: null, excluidoPor: null, atualizadoEm: serverTimestamp() });
