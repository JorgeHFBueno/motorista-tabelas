import { gravar, ler } from '../crawler/memoria';
import { APOSTAS } from './carteira';

// Placar de cada jogo (neste navegador): aposta escolhida, jogadas, vitórias (rodadas que devolveram mais que a
// aposta) e o maior prêmio líquido. O Placar de Lideres lê todos; cada gravação dispara o evento com o nome da chave.

export const JOGOS = [
  { chave: 'ledur:dev-21', nome: '21' },
  { chave: 'ledur:dev-videopoker', nome: 'VIDEO POKER' },
  { chave: 'ledur:dev-slot', nome: 'SLOT' },
] as const;
export type ChaveJogo = (typeof JOGOS)[number]['chave'];

export type PlacarJogo = { aposta: number; jogadas: number; vitorias: number; maiorPremio: number };

export const PLACAR_NOVO: PlacarJogo = { aposta: APOSTAS[0], jogadas: 0, vitorias: 0, maiorPremio: 0 };

/** Placar válido a partir do salvo (o do 21 contava "maos"). */
export function normalizarPlacar(valor: unknown): PlacarJogo {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const inteiro = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  return {
    aposta: (APOSTAS as readonly number[]).includes(v.aposta as number) ? (v.aposta as number) : APOSTAS[0],
    jogadas: inteiro(v.jogadas ?? v.maos),
    vitorias: inteiro(v.vitorias),
    maiorPremio: inteiro(v.maiorPremio),
  };
}

/** Uma rodada terminada: apostou `aposta` e voltaram `retorno` fichas (com a aposta). */
export function registrarJogada(p: PlacarJogo, aposta: number, retorno: number): PlacarJogo {
  return {
    ...p,
    jogadas: p.jogadas + 1,
    vitorias: p.vitorias + (retorno > aposta ? 1 : 0),
    maiorPremio: Math.max(p.maiorPremio, retorno - aposta),
  };
}

export const taxaDeVitorias = (p: PlacarJogo) => (p.jogadas ? Math.round((100 * p.vitorias) / p.jogadas) : 0);

export const lerPlacar = (chave: ChaveJogo) => normalizarPlacar(ler(chave));

export function gravarPlacar(chave: ChaveJogo, p: PlacarJogo) {
  gravar(chave, p);
  try { window.dispatchEvent(new CustomEvent(chave)); } catch { /* fora do navegador */ }
}
