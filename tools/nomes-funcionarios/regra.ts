/* Regra dos nomes das pessoas: só a primeira letra de cada palavra maiúscula ("JOÃO PEREIRA DE LIMA" vira "João Pereira de
 * Lima"). "de", "da", "do", "das", "dos" e "e" ficam minúsculas, salvo no começo; II, III e IV ficam maiúsculos; depois de
 * hífen ou apóstrofo a letra também sobe ("D'ÁVILA" vira "D'Ávila"); os acentos ficam. */
const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const ROMANOS = new Set(['ii', 'iii', 'iv']);
const PT = 'pt-BR';

const subir = (parte: string) => parte.charAt(0).toLocaleUpperCase(PT) + parte.slice(1);

export function nomeCapitalizado(nome: string): string {
  return nome.trim().split(/\s+/).map((palavra, i) => {
    const p = palavra.toLocaleLowerCase(PT);
    if (i > 0 && PARTICULAS.has(p)) return p;
    if (ROMANOS.has(p)) return p.toLocaleUpperCase(PT);
    return p.split(/(?<=[-'’])/).map(subir).join('');
  }).join(' ');
}

/** O nome corrigido, ou null quando fica como está. Só muda nome todo em maiúsculas ou todo em minúsculas: com as duas, alguém
 *  o escreveu assim (a própria pessoa, em Meu perfil). E-mail no lugar do nome também fica. */
export function nomeACorrigir(nome: unknown): string | null {
  if (typeof nome !== 'string' || nome.includes('@')) return null;
  if (nome !== nome.toLocaleUpperCase(PT) && nome !== nome.toLocaleLowerCase(PT)) return null;
  const novo = nomeCapitalizado(nome);
  return novo !== nome ? novo : null;
}
