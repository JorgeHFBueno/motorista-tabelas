import { embaralhar } from '../cartas/baralho';
import { agir, alvosCtrlz, fileirasPara, liderPode, opcoesDeEscolha, total, totalFileira, type Jogada, type Partida } from './regras';

// Bot do PROTOCOLO. A base: para cada jogada possível, simula e mede quanto ela muda a diferença de pontos, somando o
// valor das cartas que ela traz (MALWARE compra 2, CTRL+Z devolve uma); passa na frente quando o outro já passou e,
// atrás, gasta o mínimo para virar. FACIL erra bastante; MEDIO erra pouco; DIFICIL, além disso, testa as melhores
// jogadas (e passar) jogando a partida até o fim várias vezes, com a mão do adversário e os baralhos sorteados
// (ele não vê as suas cartas), e fica com a que mais ganha.

export const NIVEIS = [
  { nome: 'FACIL', aposta: 20, ruido: 10, acaso: 0.4, partidas: 0 },
  { nome: 'MEDIO', aposta: 50, ruido: 3, acaso: 0.08, partidas: 5 },
  { nome: 'DIFICIL', aposta: 100, ruido: 0, acaso: 0, partidas: 24 },
] as const;
export type Nivel = (typeof NIVEIS)[number];

/** PRATICA: você escolhe a facção do bot e o nível dele é sorteado às cegas (só aparece no fim); entra de graça e a vitória paga PREMIO. */
export const PRATICA = { nome: 'PRATICA', aposta: 0, premio: 30 } as const;
export const sortearNivel = (rng: () => number) => Math.floor(rng() * NIVEIS.length);

/** Quanto vale uma carta a mais na mão, em pontos. */
const VALOR_CARTA = 7;
/** Quantas jogadas o DIFICIL testa até o fim (além de passar). */
const CANDIDATAS = 4;

const diferenca = (p: Partida, quem: 0 | 1) => total(p, quem) - total(p, (1 - quem) as 0 | 1);

/** Todas as jogadas de quem está na vez (cartas iguais contam uma vez). */
export function jogadasPossiveis(p: Partida, quem: 0 | 1): Jogada[] {
  const l = p.lados[quem];
  const r: Jogada[] = [];
  const vistas = new Set<string>();
  for (const c of l.mao) {
    if (vistas.has(c.nome)) continue;
    vistas.add(c.nome);
    if (c.tipo === 'unidade' || c.tipo === 'overclock') for (const f of fileirasPara(c, l)) r.push({ tipo: 'jogar', id: c.id, fileira: f });
    else if (c.tipo === 'ctrlz') for (const alvo of alvosCtrlz(l)) r.push({ tipo: 'jogar', id: c.id, alvo: alvo.id });
    else r.push({ tipo: 'jogar', id: c.id });
  }
  if (liderPode(p, quem)) r.push({ tipo: 'lider' });
  return r;
}

/** A carta do BACKUP, do RESGATE ou da PILHAGEM: MALWARE primeiro (compra mais 2), depois a mais forte. */
export function escolherReviver(p: Partida, quem: 0 | 1, rng: () => number, nivel: Nivel = NIVEIS[2]): Jogada {
  const opcoes = opcoesDeEscolha(p);
  if (!opcoes.length) return { tipo: 'reviver', id: null };
  if (rng() < nivel.acaso) return { tipo: 'reviver', id: opcoes[Math.floor(rng() * opcoes.length)].id };
  const nota = (c: (typeof opcoes)[number]) =>
    (c.hab === 'malware' && p.lados[quem].baralho.length ? 100 : 0) + (c.tipo === 'unidade' ? c.forca : 6) + (c.hab === 'backup' ? 3 : 0) + (c.heroi ? 4 : 0);
  return { tipo: 'reviver', id: opcoes.reduce((a, b) => (nota(b) > nota(a) ? b : a)).id };
}

/** Simula a jogada (resolvendo o BACKUP como o bot resolveria). */
function simular(p: Partida, quem: 0 | 1, j: Jogada, rng: () => number): Partida {
  let q = agir(p, j, rng);
  for (let k = 0; k < 6 && q.pendente === quem; k++) q = agir(q, escolherReviver(q, quem, rng), rng);
  return q;
}

type Avaliada = { j: Jogada; depois: Partida; ganho: number; gasto: number; valor: number };

function avaliar(p: Partida, quem: 0 | 1, rng: () => number): Avaliada[] {
  const antes = diferenca(p, quem);
  const mao = p.lados[quem].mao.length;
  return jogadasPossiveis(p, quem).map((j) => {
    const depois = simular(p, quem, j, rng);
    const ganho = diferenca(depois, quem) - antes;
    // cartas que saíram da mão (MALWARE: -1, entrou mais do que saiu; líder: 0)
    const gasto = mao - depois.lados[quem].mao.length;
    // o líder é de uso único: só vale a pena se fizer diferença
    const valor = ganho + VALOR_CARTA * (1 - gasto) - (j.tipo === 'lider' ? VALOR_CARTA + 3 : 0);
    return { j, depois, ganho, gasto, valor };
  });
}

/** Jogada rápida, sem simular: a usada para jogar as partidas até o fim na cabeça do DIFICIL. */
function jogadaRapida(p: Partida, rng: () => number): Jogada {
  if (p.fase === 'troca') return { tipo: 'pronto' };
  if (p.fase === 'placar') return { tipo: 'seguir' };
  if (p.pendente !== null) return escolherReviver(p, p.pendente, rng);
  const quem = p.vez;
  const eu = p.lados[quem];
  const ele = p.lados[(1 - quem) as 0 | 1];
  const diff = diferenca(p, quem);
  if (ele.passou && diff > 0) return { tipo: 'passar' };
  if (!eu.mao.length) return liderPode(p, quem) ? { tipo: 'lider' } : { tipo: 'passar' };
  const forca = eu.mao.reduce((s, c) => s + (c.tipo === 'unidade' ? c.forca : 3), 0);
  if (ele.passou && diff + forca <= 0) return { tipo: 'passar' };
  if (!ele.passou && eu.vidas > 1 && diff > 6 && rng() < 0.4) return { tipo: 'passar' };
  if (liderPode(p, quem) && rng() < 0.15) return { tipo: 'lider' };
  // uma carta sorteada, com a fileira mais simples
  for (let k = 0; k < 4; k++) {
    const c = eu.mao[Math.floor(rng() * eu.mao.length)];
    if (c.tipo === 'unidade') {
      const fs = fileirasPara(c, eu);
      return { tipo: 'jogar', id: c.id, fileira: fs[Math.floor(rng() * fs.length)] };
    }
    if (c.tipo === 'overclock') {
      const fs = fileirasPara(c, eu);
      if (fs.length) return { tipo: 'jogar', id: c.id, fileira: fs.reduce((a, b) => (totalFileira(p, quem, b) > totalFileira(p, quem, a) ? b : a)) };
      continue;
    }
    if (c.tipo === 'ctrlz') {
      const alvos = alvosCtrlz(eu);
      if (alvos.length) return { tipo: 'jogar', id: c.id, alvo: alvos[Math.floor(rng() * alvos.length)].id };
      continue;
    }
    return { tipo: 'jogar', id: c.id };
  }
  return { tipo: 'passar' };
}

/** O que o bot não vê, sorteado: a mão e o baralho do adversário (trocados entre si) e a ordem do próprio baralho. */
function sortearOculto(p: Partida, quem: 0 | 1, rng: () => number): Partida {
  const outro = (1 - quem) as 0 | 1;
  const ele = p.lados[outro];
  const ocultas = embaralhar([...ele.mao, ...ele.baralho], rng);
  const lados = [...p.lados] as Partida['lados'];
  lados[outro] = { ...ele, mao: ocultas.slice(0, ele.mao.length), baralho: ocultas.slice(ele.mao.length) };
  lados[quem] = { ...p.lados[quem], baralho: embaralhar(p.lados[quem].baralho, rng) };
  return { ...p, lados };
}

/** Joga até o fim com jogadas rápidas: 1 se `quem` vence, 0,5 no empate, 0 se perde. */
function ateOFim(p: Partida, quem: 0 | 1, rng: () => number): number {
  let q = p;
  for (let k = 0; k < 400 && q.fase !== 'fim'; k++) {
    const r = agir(q, jogadaRapida(q, rng), rng);
    q = r === q ? agir(q, { tipo: 'passar' }, rng) : r;
  }
  return q.vencedor === quem ? 1 : q.vencedor === null && q.fase === 'fim' ? 0.5 : 0;
}

/** A jogada do bot (quem está na vez, ou quem escolhe o BACKUP). */
export function decidirBot(p: Partida, rng: () => number, nivel: Nivel = NIVEIS[2]): Jogada {
  // CODIGO LIVRE escolhe começar em segundo (vê o que o outro faz)
  if (p.fase === 'troca') return p.escolheInicio && p.vez === 0 ? { tipo: 'inicio', quem: 1 } : { tipo: 'pronto' };
  if (p.fase === 'placar') return { tipo: 'seguir' };
  if (p.pendente !== null) return escolherReviver(p, p.pendente, rng, nivel);
  const quem = p.vez;
  const eu = p.lados[quem];
  const ele = p.lados[(1 - quem) as 0 | 1];
  const diff = diferenca(p, quem);
  const avaliadas = avaliar(p, quem, rng);
  if (!avaliadas.length) return { tipo: 'passar' };

  // na frente e o outro já passou: passa e leva a rodada
  if (ele.passou && diff > 0) return { tipo: 'passar' };

  if (nivel.partidas > 0) {
    const candidatas: Jogada[] = [{ tipo: 'passar' }, ...[...avaliadas].sort((a, b) => b.valor - a.valor).slice(0, CANDIDATAS).map((a) => a.j)];
    const notas = candidatas.map((j) => {
      let soma = 0;
      for (let k = 0; k < nivel.partidas; k++) {
        const oculto = sortearOculto(p, quem, rng);
        soma += ateOFim(simular(oculto, quem, j, rng), quem, rng);
      }
      return soma;
    });
    return candidatas[notas.indexOf(Math.max(...notas))];
  }

  if (ele.passou) {
    // atrás (ou empatado): o que vira gastando menos
    const viram = avaliadas.filter((a) => diferenca(a.depois, quem) > 0).sort((a, b) => a.gasto - b.gasto || diferenca(a.depois, quem) - diferenca(b.depois, quem));
    if (viram.length && rng() >= nivel.acaso) return viram[0].j;
    // não vira de uma vez: segue só se a mão toda ainda dá (senão guarda as cartas)
    const potencial = eu.mao.reduce((s, c) => s + (c.tipo === 'unidade' ? c.forca : 4), 0);
    if (diff + potencial <= 0) return { tipo: 'passar' };
    return avaliadas.reduce((a, b) => (b.ganho > a.ganho ? b : a)).j;
  }

  // o FACIL às vezes passa na frente sem pensar
  if (nivel.acaso > 0.2 && diff > 0 && rng() < 0.1) return { tipo: 'passar' };
  if (rng() < nivel.acaso) return avaliadas[Math.floor(rng() * avaliadas.length)].j;
  const notas = avaliadas.map((a) => a.valor + (nivel.ruido ? (rng() - 0.5) * 2 * nivel.ruido : 0));
  const melhor = avaliadas[notas.indexOf(Math.max(...notas))];
  // só o líder sobrou e ele não ajuda: passa
  if (melhor.j.tipo === 'lider' && melhor.ganho <= 0) return { tipo: 'passar' };
  return melhor.j;
}

