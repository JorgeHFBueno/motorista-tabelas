/** Posição entre dois vizinhos, para reordenar sem renumerar a semana (o mesmo critério do Friday). */
export function posicaoEntre(antes: number | null, depois: number | null): number {
  if (antes === null && depois === null) return Date.now();
  if (antes === null) return depois! - 1000;
  if (depois === null) return antes + 1000;
  return (antes + depois) / 2;
}

/** Nova posição de `id` ao soltá-lo antes de `antesDe` (null = no fim), entre as linhas da semana em ordem. */
export function posicaoAoSoltar(linhas: readonly { id: string; posicao: number }[], id: string, antesDe: string | null): number | null {
  if (id === antesDe) return null;
  const outras = linhas.filter((linha) => linha.id !== id);
  const indice = antesDe === null ? outras.length : outras.findIndex((linha) => linha.id === antesDe);
  if (indice < 0) return null;
  const atual = linhas.findIndex((linha) => linha.id === id);
  if (atual >= 0 && atual === indice) return null; // soltou no mesmo lugar
  return posicaoEntre(outras[indice - 1]?.posicao ?? null, outras[indice]?.posicao ?? null);
}
