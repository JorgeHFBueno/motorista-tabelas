// Marcação (@) nas observações do cronograma, como no Friday: na caixa a pessoa aparece como "@Nome"; no banco, o
// texto guarda a marca @{uid} e a observação a lista `marcados` (a Function logisticaObservacaoMencao avisa cada um).
// Regras puras, sem Firebase; teste em tests/logistica-cronograma.test.ts.

/** Teto de pessoas marcadas numa observação (o mesmo das Rules). */
export const MAX_MARCADOS = 20;

const MARCA = /@\{([^{}\s]+)\}/g;

/** Texto com as marcas @{uid} trocadas por @Nome (para mostrar e para editar). */
export function textoComNomes(texto: string, nome: (uid: string) => string): string {
  return texto.replace(MARCA, (_marca, uid: string) => `@${nome(uid)}`);
}

/** Partes do texto para mostrar: texto comum e marcas (com o UID), na ordem. */
export function partesDoTexto(texto: string): ({ texto: string } | { uid: string })[] {
  return texto.split(/(@\{[^{}\s]+\})/g).filter(Boolean).map((parte) => {
    const marca = parte.match(/^@\{([^{}\s]+)\}$/);
    return marca ? { uid: marca[1] } : { texto: parte };
  });
}

/**
 * Na publicação: cada "@Nome" de uma pessoa escolhida na lista vira @{uid} (nomes mais longos primeiro, para "@Ana
 * Paula" não virar "@Ana" + " Paula"); quem saiu do texto não fica marcado. Devolve o texto e os UIDs na ordem do
 * texto, sem repetir (as marcas @{uid} que ficaram como estavam na edição também contam).
 */
export function marcarTexto(texto: string, escolhidos: readonly { uid: string; nome: string }[]): { texto: string; marcados: string[] } {
  let final = texto;
  for (const pessoa of [...escolhidos].sort((a, b) => b.nome.length - a.nome.length)) {
    if (!pessoa.nome || !final.includes(`@${pessoa.nome}`)) continue;
    final = final.split(`@${pessoa.nome}`).join(`@{${pessoa.uid}}`);
  }
  const marcados = [...new Set(partesDoTexto(final).flatMap((parte) => ('uid' in parte ? [parte.uid] : [])))];
  return { texto: final, marcados: marcados.slice(0, MAX_MARCADOS) };
}

/**
 * Para editar: as marcas viram "@Nome" (e a pessoa fica escolhida); a de quem não tem nome conhecido, ou com o mesmo
 * nome de outra marcada, fica como @{uid}, para a edição não trocar nem perder ninguém.
 */
export function paraEditar(texto: string, nome: (uid: string) => string | undefined): { texto: string; escolhidos: { uid: string; nome: string }[] } {
  const uids = [...new Set(partesDoTexto(texto).flatMap((parte) => ('uid' in parte ? [parte.uid] : [])))];
  const nomes = new Map(uids.map((uid) => [uid, nome(uid)?.trim() ?? '']));
  const repetido = (n: string) => [...nomes.values()].filter((outro) => outro === n).length > 1;
  const escolhidos = uids.filter((uid) => nomes.get(uid) && !repetido(nomes.get(uid)!)).map((uid) => ({ uid, nome: nomes.get(uid)! }));
  const trocar = new Map(escolhidos.map((pessoa) => [pessoa.uid, pessoa.nome]));
  return { texto: texto.replace(MARCA, (marca, uid: string) => (trocar.has(uid) ? `@${trocar.get(uid)}` : marca)), escolhidos };
}

/** O "@termo" sendo escrito antes do cursor (para abrir a lista), ou null. */
export function buscaDaMarca(texto: string, cursor: number): { termo: string; inicio: number } | null {
  const marca = texto.slice(0, cursor).match(/(^|\s)@([^\s@]{0,30})$/);
  return marca ? { termo: marca[2], inicio: cursor - marca[2].length - 1 } : null;
}
