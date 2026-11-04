// Bots do poker, sem DOM. Cada bot estima a chance de ganhar (simulando o resto da mesa e as cartas dos outros
// algumas centenas de vezes), compara com o que precisa pagar e joga pelo estilo: cauteloso (aperta, aposta pouco),
// normal ou agressivo (aposta mais e blefa mais). Blefe leve (decisão do responsável): de vez em quando aposta com
// mão fraca.

import { novoBaralho, type Carta } from '../cartas/baralho';
import { comparar, melhorMao } from './maos';
import { novoJogador, opcoes, pote, vivos, type Acao, type Estilo, type Jogador, type Mesa } from './mesa';

export const NOMES_BOT = ['DAEMON', 'KERNEL', 'CACHE', 'PROXY', 'SOCKET', 'BUFFER', 'THREAD', 'MUTEX', 'CRON', 'PIXEL'] as const;
const ESTILOS: Estilo[] = ['cauteloso', 'normal', 'agressivo'];

/** aperto: quanto a mais de chance o bot quer para pagar; agressao: vontade de aumentar; blefe: chance de blefar. */
export const PERFIL: Record<Estilo, { aperto: number; agressao: number; blefe: number }> = {
  cauteloso: { aperto: 0.06, agressao: 0.5, blefe: 0.03 },
  normal: { aperto: 0, agressao: 1, blefe: 0.07 },
  agressivo: { aperto: -0.05, agressao: 1.5, blefe: 0.14 },
};

/** Bot novo para um lugar: nome e estilo sorteados, sem repetir os nomes que já estão na mesa. */
export function novoBot(rng: () => number, ocupados: string[] = []): Jogador {
  const livres = NOMES_BOT.filter((n) => !ocupados.includes(n));
  const nome = livres[Math.floor(rng() * livres.length)] ?? NOMES_BOT[0];
  return novoJogador(nome, ESTILOS[Math.floor(rng() * ESTILOS.length)]);
}

/** Chance de ganhar (empate conta meio) contra `oponentes` mãos aleatórias, completando a mesa. */
export function chance(minhas: Carta[], mesa: Carta[], oponentes: number, rng: () => number, vezes = 200): number {
  const usadas = new Set([...minhas, ...mesa].map((c) => `${c.valor}${c.naipe}`));
  const resto = novoBaralho().filter((c) => !usadas.has(`${c.valor}${c.naipe}`));
  let pontos = 0;
  for (let v = 0; v < vezes; v++) {
    // embaralha só o que precisa (Fisher-Yates parcial)
    const precisa = 5 - mesa.length + 2 * oponentes;
    const b = resto.slice();
    for (let i = 0; i < precisa; i++) {
      const j = i + Math.floor(rng() * (b.length - i));
      [b[i], b[j]] = [b[j], b[i]];
    }
    const completa = [...mesa, ...b.slice(0, 5 - mesa.length)];
    const eu = melhorMao([...minhas, ...completa]);
    let resultado = 1;
    for (let o = 0; o < oponentes; o++) {
      const k = 5 - mesa.length + 2 * o;
      const d = comparar(eu, melhorMao([b[k], b[k + 1], ...completa]));
      if (d < 0) { resultado = 0; break; }
      if (d === 0) resultado = Math.min(resultado, 0.5);
    }
    pontos += resultado;
  }
  return pontos / vezes;
}

/** A jogada do bot da vez. */
export function decidir(m: Mesa, rng: () => number, vezes = 200): Acao {
  const i = m.vez;
  const eu = m.jogadores[i];
  const perfil = PERFIL[eu.estilo ?? 'normal'];
  const o = opcoes(m, i);
  const oponentes = vivos(m).length - 1;
  const p = chance(eu.cartas, m.comunitarias.slice(0, m.abertas), oponentes, rng, vezes);
  // força relativa: 1 é a média da mesa (com 3 oponentes, 25% de chance)
  const relativa = p * (oponentes + 1);
  const potAgora = pote(m);
  const aumentar = (fracao: number): Acao => ({ tipo: 'aumentar', total: m.maior + Math.max(m.minimo, Math.round((potAgora * fracao) / 5) * 5) });
  const blefa = rng() < perfil.blefe;

  if (o.podePassar) {
    if (o.podeAumentar && (relativa > 1.5 - 0.15 * perfil.agressao || blefa)) return aumentar(blefa && relativa < 1.2 ? 0.5 : 0.75);
    return { tipo: 'passar' };
  }
  // precisa pagar: compara a chance com o preço (o que paga sobre o pote que pode levar)
  const preco = o.pagar / (potAgora + o.pagar);
  if (o.podeAumentar && relativa > 1.9 - 0.2 * perfil.agressao && rng() < 0.45 * perfil.agressao) return aumentar(0.75);
  if (p >= preco + perfil.aperto) return { tipo: 'pagar' };
  if (o.podeAumentar && blefa && rng() < 0.3) return aumentar(0.6);
  return { tipo: 'desistir' };
}
