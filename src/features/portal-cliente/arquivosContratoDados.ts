import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, type DocumentData } from 'firebase/firestore';
import { db } from '../../firebase';
import { enviarArquivo } from './portalArquivos';
import { caminhosPortal, LIMITES_ARQUIVO, PORTAL_COLECOES, type ArquivoPortal, type ContratoPortal, type PessoaRef } from './portalDominio';
import { ehImagem, lerArquivo, lerData, lerPessoa, lerTexto } from './contratoConteudoDominio';

// portal-documentos and portal-fotos of one contract (Manuscript portal.md), sent by adm2. Every record is created
// with excluidoEm/excluidoPor null (the client's query filters excluidoEm == null); nobody deletes: the trash is
// excluidoEm + excluidoPor.

type RegistroArquivo = {
  id: string;
  arquivo: ArquivoPortal | null;
  criadoEm: Date | null;
  criadoPor: PessoaRef | null;
  excluidoEm: Date | null;
  excluidoPor: PessoaRef | null;
};

export type DocumentoContrato = RegistroArquivo & { titulo: string; categoria: string };
export type FotoContrato = RegistroArquivo & { etapa: string; observacao: string | null };
export type ColecaoArquivos = 'documentos' | 'fotos';

const registro = (id: string, data: DocumentData): RegistroArquivo => ({
  id,
  arquivo: lerArquivo(data.arquivo),
  criadoEm: lerData(data.criadoEm),
  criadoPor: lerPessoa(data.criadoPor),
  excluidoEm: lerData(data.excluidoEm),
  excluidoPor: lerPessoa(data.excluidoPor),
});

const maisRecentesPrimeiro = (a: RegistroArquivo, b: RegistroArquivo) => (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0);

// adm2 reads everything: only the obraId filter (no composite index); trash and order are done here.
const docsDoContrato = async (colecao: ColecaoArquivos, obraId: string) =>
  (await getDocs(query(collection(db, PORTAL_COLECOES[colecao]), where('obraId', '==', obraId)))).docs;

export async function listarDocumentos(obraId: string): Promise<DocumentoContrato[]> {
  return (await docsDoContrato('documentos', obraId))
    .map((item) => {
      const data = item.data();
      return { ...registro(item.id, data), titulo: lerTexto(data.titulo) ?? 'Documento', categoria: lerTexto(data.categoria) ?? '' };
    })
    .sort(maisRecentesPrimeiro);
}

export async function listarFotos(obraId: string): Promise<FotoContrato[]> {
  return (await docsDoContrato('fotos', obraId))
    .map((item) => {
      const data = item.data();
      return { ...registro(item.id, data), etapa: lerTexto(data.etapa) ?? '', observacao: lerTexto(data.observacao) };
    })
    .sort(maisRecentesPrimeiro);
}

const vinculo = (contrato: ContratoPortal, pessoa: PessoaRef) => ({
  obraId: contrato.id,
  clienteDocumento: contrato.clienteDocumento,
  criadoEm: serverTimestamp(),
  criadoPor: { uid: pessoa.uid, nome: pessoa.nome },
  excluidoEm: null,
  excluidoPor: null,
});

/** The id comes first, so the file goes to portal/obras/{obraId}/documentos/{documentoId}/... */
export async function enviarDocumento(
  contrato: ContratoPortal,
  dados: { titulo: string; categoria: string; arquivo: File },
  pessoa: PessoaRef,
) {
  const ref = doc(collection(db, PORTAL_COLECOES.documentos));
  const arquivo = await enviarArquivo(caminhosPortal.documento(contrato.id, ref.id, dados.arquivo.name), dados.arquivo, LIMITES_ARQUIVO.documento);
  await setDoc(ref, { ...vinculo(contrato, pessoa), titulo: dados.titulo, categoria: dados.categoria, arquivo });
}

export async function enviarFoto(
  contrato: ContratoPortal,
  dados: { etapa: string; observacao: string | null; arquivo: File },
  pessoa: PessoaRef,
) {
  if (!ehImagem(dados.arquivo.type)) throw new Error('Escolha uma imagem (JPG, PNG...).');
  const ref = doc(collection(db, PORTAL_COLECOES.fotos));
  const arquivo = await enviarArquivo(caminhosPortal.foto(contrato.id, ref.id, dados.arquivo.name), dados.arquivo, LIMITES_ARQUIVO.foto);
  await setDoc(ref, { ...vinculo(contrato, pessoa), etapa: dados.etapa, observacao: dados.observacao, arquivo });
}

export const moverParaLixeira = (colecao: ColecaoArquivos, id: string, pessoa: PessoaRef) =>
  updateDoc(doc(db, PORTAL_COLECOES[colecao], id), { excluidoEm: serverTimestamp(), excluidoPor: { uid: pessoa.uid, nome: pessoa.nome } });

export const restaurarDaLixeira = (colecao: ColecaoArquivos, id: string) =>
  updateDoc(doc(db, PORTAL_COLECOES[colecao], id), { excluidoEm: null, excluidoPor: null });
