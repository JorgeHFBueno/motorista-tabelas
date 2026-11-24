// Datas festivas do corvo: em cada festa ele ganha um enfeite, desenhado por cima de qualquer quadro de qualquer
// animação, preso ao alto da cabeça e virado para o lado em que ele olha. Para acrescentar uma festa: o período em
// FESTAS e o desenho em `enfeitar`. As datas são as de Brasília.

export type Festa = 'natal';

/** Período de cada festa, todo ano: [mês, dia] de início e de fim, inclusive (pode virar o ano). */
const FESTAS: { festa: Festa; de: [number, number]; ate: [number, number] }[] = [
  // gorro de Natal: de 24/11 a 06/01 (Dia de Reis); decisão do responsável em 2026-11-24
  { festa: 'natal', de: [11, 24], ate: [1, 6] },
];

/** A festa do dia em Brasília, ou null. */
export function festaDoDia(agora: Date): Festa | null {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', month: 'numeric', day: 'numeric' }).formatToParts(agora);
  const mes = Number(partes.find((p) => p.type === 'month')?.value);
  const dia = Number(partes.find((p) => p.type === 'day')?.value);
  const hoje = mes * 100 + dia;
  for (const { festa, de, ate } of FESTAS) {
    const inicio = de[0] * 100 + de[1];
    const fim = ate[0] * 100 + ate[1];
    const dentro = inicio <= fim ? hoje >= inicio && hoje <= fim : hoje >= inicio || hoje <= fim;
    if (dentro) return festa;
  }
  return null;
}

/**
 * O alto da cabeça no quadro: a primeira linha com corpo ('#'). De perfil (bico à direita ou à esquerda da cabeça), o
 * topo são os 3 pixels do lado do bico; de frente, a ponta inteira.
 */
function topoDaCabeca(linhas: string[]): { x: number; y: number; lado: -1 | 0 | 1; largura: number } | null {
  const y = linhas.findIndex((l) => l.includes('#'));
  if (y < 0) return null;
  const xs = [...linhas[y]].map((c, x) => (c === '#' ? x : -1)).filter((x) => x >= 0);
  const centro = (xs[0] + xs[xs.length - 1]) / 2;
  const bico: number[] = [];
  for (let k = y; k < Math.min(y + 8, linhas.length); k++) [...linhas[k]].forEach((c, x) => { if (c === 'b' || c === 'M') bico.push(x); });
  const media = bico.length ? bico.reduce((a, b) => a + b, 0) / bico.length : centro;
  const lado = media > centro + 2 ? 1 : media < centro - 2 ? -1 : 0;
  if (lado === 1) return { x: xs[xs.length - 1] - 2, y, lado, largura: 3 };
  if (lado === -1) return { x: xs[0], y, lado, largura: 3 };
  return { x: xs[0], y, lado, largura: xs.length };
}

/** Desenha o enfeite da festa ('r' vermelho, 'R' dobra, 'g' branco) por cima do quadro. */
export function enfeitar(linhas: string[], festa: Festa | null): string[] {
  if (!festa) return linhas;
  const topo = topoDaCabeca(linhas);
  if (!topo) return linhas;
  const g = linhas.map((l) => l.split(''));
  const { x: ax, y: ay, lado } = topo;
  const centro = ax + (topo.largura - 1) / 2;
  // desenhado como se olhasse para a direita; olhando para a esquerda, espelha em volta do topo da cabeça
  const p = (dx: number, dy: number, c: string) => {
    const x = lado === -1 ? Math.round(2 * centro - (ax + dx)) : ax + dx;
    const y = ay + dy;
    if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = c;
  };
  if (lado !== 0) {
    // de perfil: barra branca na testa, corpo vermelho e a ponta caída para trás com o pompom
    [-1, 0, 1, 2, 3].forEach((d) => p(d, 1, 'g'));
    [-1, 0, 1, 2, 3].forEach((d) => p(d, 0, 'r'));
    [-2, -1, 0, 1, 2].forEach((d) => p(d, -1, 'r'));
    [-3, -2, -1, 0].forEach((d) => p(d, -2, 'r'));
    p(-4, -1, 'r');
    p(-3, -1, 'R');
    p(-5, 0, 'g');
    p(-4, 0, 'g');
    p(-5, 1, 'g');
  } else {
    // de frente: barra branca, corpo vermelho e a ponta caída para o lado com o pompom
    [-2, -1, 0, 1, 2, 3].forEach((d) => p(d, 1, 'g'));
    [-1, 0, 1, 2].forEach((d) => p(d, 0, 'r'));
    [0, 1, 2].forEach((d) => p(d, -1, 'r'));
    [2, 3].forEach((d) => p(d, -2, 'r'));
    p(1, -1, 'R');
    p(4, -2, 'g');
    p(4, -1, 'g');
    p(5, -1, 'g');
  }
  return g.map((l) => l.join(''));
}
