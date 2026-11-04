import { collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { enviarArquivo } from './portalArquivos';
import { caminhosPortal, LIMITES_ARQUIVO, PORTAL_COLECOES, type ArquivoPortal, type ContratoPortal, type PessoaRef } from './portalDominio';
import { ehPdfOuImagem, lerArquivo, lerData, lerPessoa, lerStatusParcela, lerTexto, type DadosParcela, type StatusParcela } from './contratoConteudoDominio';

// portal-parcelas of one contract (Manuscript portal.md), typed by adm2. Money in cents, vencimento 'AAAA-MM-DD'.
// Every update sets atualizadoEm; nobody deletes (trash = excluidoEm + excluidoPor).

export type ParcelaContrato = {
  id: string;
  numero: number;
  descricao: string | null;
  valor: number;
  vencimento: string | null;
  status: StatusParcela;
  boleto: ArquivoPortal | null;
  comprovante: ArquivoPortal | null;
  comprovanteEnviadoEm: Date | null;
  comprovanteEnviadoPor: PessoaRef | null;
  observacaoCliente: string | null;
  observacaoAdmin: string | null;
  conferidoEm: Date | null;
  conferidoPor: PessoaRef | null;
  excluidoEm: Date | null;
  excluidoPor: PessoaRef | null;
};

const inteiro = (valor: unknown) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : 0);
const pessoaRef = (pessoa: PessoaRef) => ({ uid: pessoa.uid, nome: pessoa.nome });
const parcelaRef = (id: string) => doc(db, PORTAL_COLECOES.parcelas, id);

// adm2 reads everything: only the obraId filter (no composite index); trash and order are done here.
export async function listarParcelas(obraId: string): Promise<ParcelaContrato[]> {
  const snapshot = await getDocs(query(collection(db, PORTAL_COLECOES.parcelas), where('obraId', '==', obraId)));
  return snapshot.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        numero: inteiro(data.numero),
        descricao: lerTexto(data.descricao),
        valor: inteiro(data.valor),
        vencimento: lerTexto(data.vencimento),
        status: lerStatusParcela(data.status),
        boleto: lerArquivo(data.boleto),
        comprovante: lerArquivo(data.comprovante),
        comprovanteEnviadoEm: lerData(data.comprovanteEnviadoEm),
        comprovanteEnviadoPor: lerPessoa(data.comprovanteEnviadoPor),
        observacaoCliente: lerTexto(data.observacaoCliente),
        observacaoAdmin: lerTexto(data.observacaoAdmin),
        conferidoEm: lerData(data.conferidoEm),
        conferidoPor: lerPessoa(data.conferidoPor),
        excluidoEm: lerData(data.excluidoEm),
        excluidoPor: lerPessoa(data.excluidoPor),
      };
    })
    .sort((a, b) => a.numero - b.numero || (a.vencimento ?? '').localeCompare(b.vencimento ?? ''));
}

// Each boleto goes to a new path (Storage never overwrites); the record keeps only the latest one.
async function enviarBoleto(obraId: string, parcelaId: string, arquivo: File) {
  if (!ehPdfOuImagem(arquivo.type)) throw new Error('O boleto deve ser um PDF ou uma imagem.');
  return enviarArquivo(caminhosPortal.boleto(obraId, parcelaId, arquivo.name), arquivo, LIMITES_ARQUIVO.boleto);
}

/** Creates the installment with every field of the contract (null where empty); the boleto is optional. */
export async function criarParcela(contrato: ContratoPortal, dados: DadosParcela, boleto: File | null) {
  const ref = doc(collection(db, PORTAL_COLECOES.parcelas));
  const arquivoBoleto = boleto ? await enviarBoleto(contrato.id, ref.id, boleto) : null;
  await setDoc(ref, {
    obraId: contrato.id,
    clienteDocumento: contrato.clienteDocumento,
    numero: dados.numero,
    descricao: dados.descricao,
    valor: dados.valor,
    vencimento: dados.vencimento,
    status: 'pendente',
    boleto: arquivoBoleto,
    comprovante: null,
    comprovanteEnviadoEm: null,
    comprovanteEnviadoPor: null,
    observacaoCliente: null,
    observacaoAdmin: dados.observacaoAdmin,
    conferidoEm: null,
    conferidoPor: null,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
    excluidoEm: null,
    excluidoPor: null,
  });
}

export const editarParcela = (id: string, dados: DadosParcela) =>
  updateDoc(parcelaRef(id), { ...dados, atualizadoEm: serverTimestamp() });

export async function trocarBoleto(obraId: string, parcelaId: string, arquivo: File) {
  const boleto = await enviarBoleto(obraId, parcelaId, arquivo);
  await updateDoc(parcelaRef(parcelaId), { boleto, atualizadoEm: serverTimestamp() });
}

/** Marks as paid (with or without the client's receipt); observacaoAdmin is the note shown to the client. */
export const confirmarPagamento = (id: string, pessoa: PessoaRef, observacaoAdmin: string | null) =>
  updateDoc(parcelaRef(id), {
    status: 'pago',
    observacaoAdmin,
    conferidoEm: serverTimestamp(),
    conferidoPor: pessoaRef(pessoa),
    atualizadoEm: serverTimestamp(),
  });

/** Rejects the receipt; the reason is shown to the client, who can send a new one. */
export const recusarComprovante = (id: string, pessoa: PessoaRef, motivo: string) =>
  updateDoc(parcelaRef(id), {
    status: 'rejeitado',
    observacaoAdmin: motivo,
    conferidoEm: serverTimestamp(),
    conferidoPor: pessoaRef(pessoa),
    atualizadoEm: serverTimestamp(),
  });

export const moverParcelaParaLixeira = (id: string, pessoa: PessoaRef) =>
  updateDoc(parcelaRef(id), { excluidoEm: serverTimestamp(), excluidoPor: pessoaRef(pessoa), atualizadoEm: serverTimestamp() });

export const restaurarParcela = (id: string) =>
  updateDoc(parcelaRef(id), { excluidoEm: null, excluidoPor: null, atualizadoEm: serverTimestamp() });
