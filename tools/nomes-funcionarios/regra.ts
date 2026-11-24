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

/* Nome já com maiúsculas e minúsculas: alguém o escreveu assim (a própria pessoa, em Meu perfil), então só "Da", "Dos" e as
 * outras partículas descem ("Gilson Da Silva Dos Santos" vira "Gilson da Silva dos Santos"); o resto fica como está. */
const particulasMinusculas = (nome: string) =>
  nome.replace(/(?<=\S\s+)\S+/g, (palavra) => {
    const p = palavra.toLocaleLowerCase(PT);
    return PARTICULAS.has(p) ? p : palavra;
  });

/** O nome corrigido, ou null quando fica como está. Nome todo em maiúsculas ou todo em minúsculas segue a regra inteira; nos
 *  outros só as partículas descem. E-mail no lugar do nome fica. */
export function nomeACorrigir(nome: unknown): string | null {
  if (typeof nome !== 'string' || nome.includes('@')) return null;
  const misto = nome !== nome.toLocaleUpperCase(PT) && nome !== nome.toLocaleLowerCase(PT);
  const novo = misto ? particulasMinusculas(nome) : nomeCapitalizado(nome);
  return novo !== nome ? novo : null;
}
