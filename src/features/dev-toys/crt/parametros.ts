// Parâmetros do CRT: a força (0 a 1) vale para o CSS sobre o DOM e escala os uniforms do shader dos canvas.
export type IntensidadeCrt = 'baixa' | 'media' | 'alta';

export const INTENSIDADES: readonly IntensidadeCrt[] = ['baixa', 'media', 'alta'];
const FORCA: Record<IntensidadeCrt, number> = { baixa: 0.4, media: 0.7, alta: 1 };

export function forcaCrt(ligado: boolean, intensidade: IntensidadeCrt): number {
  return ligado ? FORCA[intensidade] : 0;
}

export type UniformsCrt = { curva: number; scan: number; vinheta: number; aberracao: number; ruido: number; flicker: number };

// Valores do plano na intensidade média; as outras escalam junto. Movimento reduzido tira o que anima (ruído e flicker).
const BASE = { curva: 0.08, scan: 0.25, vinheta: 0.25, aberracao: 1, ruido: 0.03 };

export function uniformsCrt(forca: number, movimentoReduzido: boolean): UniformsCrt {
  const k = Math.max(0, forca) / FORCA.media;
  return {
    curva: BASE.curva * k,
    scan: BASE.scan * k,
    vinheta: BASE.vinheta * k,
    aberracao: BASE.aberracao * k,
    ruido: movimentoReduzido ? 0 : BASE.ruido * k,
    flicker: movimentoReduzido || forca === 0 ? 0 : 1,
  };
}
