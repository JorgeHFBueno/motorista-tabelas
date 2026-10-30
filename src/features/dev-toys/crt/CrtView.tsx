import { useContext, useEffect, useRef } from 'react';
import { criarCrtGl } from './CrtCanvas';
import { CrtContexto } from './contexto';
import { uniformsCrt } from './parametros';

export type ModoCrt = 'webgl' | '2d';
export type Desenhar = (ctx: CanvasRenderingContext2D, info: { tempo: number; dt: number; largura: number; altura: number; modo: ModoCrt }) => void;

const QUADRO_MIN_MS = 1000 / 61; // teto de 60 quadros por segundo
const DT_MAX = 0.05; // ao voltar de outra aba, o tempo não "teleporta"

// Canvas de brinquedo com CRT de verdade: `desenhar` pinta um canvas 2D fora da tela e o shader leva para o visível.
// Sem WebGL, o 2D aparece direto (o CRT em CSS da área continua por cima).
// `transparente`: o canvas fica sobre o DOM (o brinquedo limpa o 2D a cada quadro); sem curvatura, para o desenho
// continuar onde o DOM embaixo espera.
type Props = { largura: number; altura: number; desenhar: Desenhar; transparente?: boolean };

export default function CrtView({ largura, altura, desenhar, transparente = false }: Props) {
  const visivel = useRef<HTMLCanvasElement>(null);
  const crt = useContext(CrtContexto);
  const atual = useRef({ desenhar, crt, transparente });
  useEffect(() => { atual.current = { desenhar, crt, transparente }; }, [desenhar, crt, transparente]);

  useEffect(() => {
    const canvas = visivel.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(largura * dpr);
    canvas.height = Math.round(altura * dpr);

    const fonte = document.createElement('canvas');
    fonte.width = canvas.width;
    fonte.height = canvas.height;
    const ctx = fonte.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const gl = criarCrtGl(canvas);
    const ctxVisivel = gl ? null : canvas.getContext('2d');
    const modo: ModoCrt = gl ? 'webgl' : '2d';

    let quadro = 0;
    let anterior = 0;
    let tempo = 0; // soma dos dt: o tempo parado (aba oculta) não conta
    const passo = (agora: number) => {
      quadro = requestAnimationFrame(passo);
      if (!anterior) anterior = agora - QUADRO_MIN_MS;
      if (agora - anterior < QUADRO_MIN_MS) return;
      const dt = Math.min((agora - anterior) / 1000, DT_MAX);
      anterior = agora;
      tempo += dt;
      atual.current.desenhar(ctx, { tempo, dt, largura, altura, modo });
      const { crt: { forca, movimentoReduzido }, transparente: sobreDom } = atual.current;
      if (gl) {
        const u = uniformsCrt(forca, movimentoReduzido);
        gl.desenhar(fonte, sobreDom ? { ...u, curva: 0 } : u, tempo, sobreDom);
      } else if (ctxVisivel) {
        if (sobreDom) ctxVisivel.clearRect(0, 0, canvas.width, canvas.height);
        ctxVisivel.drawImage(fonte, 0, 0);
      }
    };

    // Aba oculta: para o laço; ao voltar, recomeça sem contar o tempo parado.
    const visibilidade = () => {
      cancelAnimationFrame(quadro);
      if (document.visibilityState === 'visible') { anterior = 0; quadro = requestAnimationFrame(passo); }
    };
    quadro = requestAnimationFrame(passo);
    document.addEventListener('visibilitychange', visibilidade);
    return () => {
      cancelAnimationFrame(quadro);
      document.removeEventListener('visibilitychange', visibilidade);
      gl?.liberar();
    };
  }, [largura, altura]);

  return <canvas ref={visivel} className={transparente ? 'dt-crt-canvas dt-crt-transparente' : 'dt-crt-canvas'} style={{ width: largura, height: altura }} />;
}
