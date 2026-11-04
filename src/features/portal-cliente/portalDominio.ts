// Client portal, team side (adm2). Contract: The Manuscript, 01_FIRESTORE/COLECOES/portal.md and users.md;
// screens: 03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md. Pure domain: no Firebase here, so it can be tested in Node.

export const PORTAL_COLECOES = {
  clientes: 'users',
  obras: 'portal-obras',
  documentos: 'portal-documentos',
  fotos: 'portal-fotos',
  parcelas: 'portal-parcelas',
  atendimentos: 'portal-atendimentos',
  noticias: 'portal-noticias',
} as const;

export type PessoaRef = { uid: string; nome: string };

// File reference stored in Firestore: only the Storage path, never a download URL.
export type ArquivoPortal = { path: string; nome: string; contentType: string; bytes: number };

export type ClientePortal = {
  uid: string;
  nome: string;
  email: string;
  documentos: string[];
  ativo: boolean;
};

export type ContratoPortal = {
  id: string; // = obras-v2/{id}
  clienteDocumento: string;
  nome: string;
  local: string | null;
  numeroContrato: string | null;
  previsao: { inicio: string | null; fim: string | null };
  valorContrato: number | null; // cents
  progresso: unknown;
  equipe: { saida: unknown; chegada: unknown } | null;
};

// ---------------------------------------------------------------- CNPJ / CPF

export const apenasDigitos = (valor: string) => valor.replace(/\D/g, '');

const cpfValido = (cpf: string) => {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number) => {
    const soma = [...base].reduce((acc, d, i) => acc + Number(d) * (pesoInicial - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9]) && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
};

const cnpjValido = (cnpj: string) => {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...base].reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cnpj.slice(0, 12)) === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
};

/** CNPJ/CPF as stored (digits only, valid check digits), or null when the text is not a valid one. */
export function normalizarDocumento(valor: string | null | undefined): string | null {
  const digitos = apenasDigitos(valor ?? '');
  if (digitos.length === 11) return cpfValido(digitos) ? digitos : null;
  if (digitos.length === 14) return cnpjValido(digitos) ? digitos : null;
  return null;
}

/** 12.345.678/0001-95 or 123.456.789-09; anything else as it is. */
export function formatarDocumento(documento: string): string {
  if (/^\d{14}$/.test(documento)) return documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (/^\d{11}$/.test(documento)) return documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return documento;
}

// ---------------------------------------------------------------- money (cents) and dates

/** "1.234,56", "1234,56", "1234.56" or "R$ 1.234,56" -> 123456 cents; null when empty or invalid. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s]/g, '');
  if (!limpo) return null;
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return null;
  return Math.round(Number(normalizado) * 100);
}

export const formatarCentavos = (centavos: number | null | undefined) =>
  typeof centavos === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
    : '—';

/** Value for an input: 123456 -> "1234,56". */
export const centavosParaTexto = (centavos: number | null | undefined) =>
  typeof centavos === 'number' ? (centavos / 100).toFixed(2).replace('.', ',') : '';

export const dataIsoValida = (valor: string) => /^\d{4}-\d{2}-\d{2}$/.test(valor);

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA'. */
export const formatarDataIso = (valor: string | null | undefined) =>
  valor && dataIsoValida(valor) ? valor.split('-').reverse().join('/') : '—';

// ---------------------------------------------------------------- Storage paths (Storage Rules match these)

const nomeSeguro = (nome: string) => {
  const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
  return limpo || 'arquivo';
};

const carimbo = (nome: string) => `${Date.now()}_${nomeSeguro(nome)}`;

export const caminhosPortal = {
  documento: (obraId: string, documentoId: string, nome: string) => `portal/obras/${obraId}/documentos/${documentoId}/${carimbo(nome)}`,
  foto: (obraId: string, fotoId: string, nome: string) => `portal/obras/${obraId}/fotos/${fotoId}/${carimbo(nome)}`,
  boleto: (obraId: string, parcelaId: string, nome: string) => `portal/obras/${obraId}/parcelas/${parcelaId}/boleto/${carimbo(nome)}`,
  anexoAtendimento: (atendimentoId: string, mensagemId: string, nome: string) => `portal/atendimentos/${atendimentoId}/${mensagemId}/${carimbo(nome)}`,
  imagemNoticia: (noticiaId: string, nome: string) => `portal/noticias/${noticiaId}/${carimbo(nome)}`,
};

// Storage limits of the Rules (storage.rules, "client portal").
export const LIMITES_ARQUIVO = {
  documento: 50 * 1024 * 1024,
  foto: 20 * 1024 * 1024,
  boleto: 10 * 1024 * 1024,
  anexo: 10 * 1024 * 1024,
  imagemNoticia: 10 * 1024 * 1024,
};
