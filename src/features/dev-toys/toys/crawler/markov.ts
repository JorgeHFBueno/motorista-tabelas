// "Mini-LLM" do Crawler: cadeia de Markov de bigramas treinada nas palavras que ele comeu, na ordem em que comeu.
export type Markov = Map<string, string[]>;

export function treinar(palavras: string[]): Markov {
  const modelo: Markov = new Map();
  for (let i = 0; i < palavras.length - 1; i++) {
    const seguintes = modelo.get(palavras[i]) ?? [];
    seguintes.push(palavras[i + 1]);
    modelo.set(palavras[i], seguintes);
  }
  return modelo;
}

/** n palavras: cada uma segue a anterior como no treino; sem continuação, recomeça de uma palavra qualquer. */
export function gerar(modelo: Markov, n: number, rng: () => number): string[] {
  const chaves = [...modelo.keys()];
  if (!chaves.length) return [];
  const sorteia = (lista: string[]) => lista[Math.floor(rng() * lista.length)];
  const saida = [sorteia(chaves)];
  while (saida.length < n) {
    const seguintes = modelo.get(saida[saida.length - 1]);
    saida.push(seguintes?.length ? sorteia(seguintes) : sorteia(chaves));
  }
  return saida;
}
