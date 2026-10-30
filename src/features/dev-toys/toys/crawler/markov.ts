// "Mini-LLM" do Crawler: cadeia de Markov sobre as palavras que ele comeu, na ordem de leitura de cada texto.
// Olha as duas últimas palavras (trigrama) e, sem continuação, só a última (bigrama). Escreve frases inteiras:
// começa onde uma frase começava e termina num ponto final, sem repetir trechos nem aberturas no mesmo texto.

export type Markov = {
  /** "w1 w2" → palavras que vieram depois desse par */
  tri: Map<string, string[]>;
  /** "w" → palavras que vieram depois dela */
  bi: Map<string, string[]>;
  /** palavras que abriam frase (início do corpus ou depois de ponto final) */
  inicios: string[];
};

/** Termina frase: . ! ? (também seguidos de aspas ou parêntese). */
export const fimDeFrase = (w: string) => /[.!?]["')\]]*$/.test(w);

const anexar = (m: Map<string, string[]>, chave: string, w: string) => {
  const lista = m.get(chave);
  if (lista) lista.push(w);
  else m.set(chave, [w]);
};

export function treinar(palavras: string[]): Markov {
  const modelo: Markov = { tri: new Map(), bi: new Map(), inicios: [] };
  palavras.forEach((w, i) => {
    if (i === 0 || fimDeFrase(palavras[i - 1])) modelo.inicios.push(w);
    if (i >= 1) anexar(modelo.bi, palavras[i - 1], w);
    if (i >= 2) anexar(modelo.tri, `${palavras[i - 2]} ${palavras[i - 1]}`, w);
  });
  return modelo;
}

export type OpcoesGerar = {
  /** a partir daqui, termina no primeiro ponto final */
  alvo: number;
  /** teto: corta no último ponto final já escrito (se houver um razoável) */
  maximo: number;
};

/** Escreve um texto de frases inteiras com o que o modelo aprendeu. */
export function gerar(modelo: Markov, { alvo, maximo }: OpcoesGerar, rng: () => number): string[] {
  const chaves = [...modelo.bi.keys()];
  const inicios = modelo.inicios.length ? modelo.inicios : chaves;
  if (!inicios.length) return [];
  const sorteia = (lista: string[]) => lista[Math.floor(rng() * lista.length)];

  const saida: string[] = [];
  const usados = new Set<string>(); // trechos de três palavras já escritos neste texto
  const aberturas = new Set<string>(); // palavras que já abriram frase neste texto
  while (saida.length < maximo) {
    const n = saida.length;
    const anterior = saida[n - 1];
    let candidatas: string[] | undefined;
    if (n === 0 || fimDeFrase(anterior)) {
      if (n >= alvo) break; // passou do alvo e a frase acabou
      if (n > 0) candidatas = n >= 2 ? modelo.tri.get(`${saida[n - 2]} ${anterior}`) : undefined;
      // frase nova: às vezes segue o texto de origem, às vezes recomeça noutra frase
      if (!candidatas?.length || rng() < 0.5) candidatas = inicios;
    } else {
      candidatas = (n >= 2 ? modelo.tri.get(`${saida[n - 2]} ${anterior}`) : undefined) ?? modelo.bi.get(anterior);
      if (!candidatas?.length) candidatas = inicios; // beco sem saída: recomeça numa frase
    }
    // não repete trecho de três palavras nem abertura de frase já usados neste texto, se houver alternativa
    const abrindo = n === 0 || fimDeFrase(anterior);
    const nova = (w: string) => !(abrindo && aberturas.has(w)) && (n < 2 || !usados.has(`${saida[n - 2]} ${anterior} ${w}`));
    let novas = candidatas.filter(nova);
    if (!novas.length && abrindo) novas = inicios.filter(nova); // a continuação já foi usada: tenta outra abertura
    const escolhida = sorteia(novas.length ? novas : candidatas);
    if (abrindo) aberturas.add(escolhida);
    if (n >= 2) usados.add(`${saida[n - 2]} ${anterior} ${escolhida}`);
    saida.push(escolhida);
  }

  // estourou o teto no meio de uma frase: corta no último ponto final, se ele não deixar o texto curto demais
  if (!fimDeFrase(saida[saida.length - 1])) {
    let ultimo = -1;
    saida.forEach((w, i) => { if (fimDeFrase(w)) ultimo = i; });
    if (ultimo + 1 >= Math.min(alvo, maximo) / 2) saida.length = ultimo + 1;
  }
  return saida;
}
