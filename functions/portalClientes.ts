// Client portal logins (users/{uid}), validation of the adminApi endpoints. Pure: no Firebase here, so it can be
// tested in Node. Contract: The Manuscript, 01_FIRESTORE/COLECOES/users.md and portal.md ("Vínculo do cliente").

const apenasDigitos = (valor: string) => valor.replace(/\D/g, '');

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

/** CNPJ/CPF as stored (digits only, valid check digits), or null. Same rule as the WEB's portalDominio.ts. */
export function normalizarDocumento(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const digitos = apenasDigitos(valor);
  if (digitos.length === 11) return cpfValido(digitos) ? digitos : null;
  if (digitos.length === 14) return cnpjValido(digitos) ? digitos : null;
  return null;
}

/** List of CNPJ/CPF (formatted or not), normalized and without repeats; null when empty or any value is invalid. */
export function lerDocumentos(valor: unknown): string[] | null {
  if (!Array.isArray(valor) || valor.length === 0) return null;
  const documentos: string[] = [];
  for (const item of valor) {
    const documento = normalizarDocumento(item);
    if (!documento) return null;
    if (!documentos.includes(documento)) documentos.push(documento);
  }
  return documentos;
}

export type NovoCliente = { nome: string; email: string; password: string; documentos: string[] };

/** Body of POST /api/admin/clientes, or the error code answered with 400. */
export function lerNovoCliente(body: unknown): { cliente: NovoCliente } | { erro: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const nome = typeof b.nome === 'string' ? b.nome.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password.trim() : '';
  if (!nome) return { erro: 'missing_nome' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: 'missing_email' };
  if (password.length < 6) return { erro: 'invalid_password' };
  const documentos = lerDocumentos(b.documentos);
  if (!documentos) return { erro: 'invalid_documentos' };
  return { cliente: { nome, email, password, documentos } };
}
