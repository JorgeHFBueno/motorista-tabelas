import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import CrtView, { type Desenhar } from '../../crt/CrtView';
import { ESCALA } from '../../escala';
import { gerar, treinar } from './markov';
import { desenharCrawler } from './render';
import { crescer, criarCrawler, paramsDaSeed, passo, rngDe, type Crawler, type Vec } from './sim';

const L = 480;
const A = 300;
const FOLGA = 2; // px em volta da palavra que ainda contam como "dentro"
const ESPERA_NOVO_TEXTO_MS = 1500;

// Sem acento: a Monaco não tem os glifos.
const TEXTO = (
  'O caminhao saiu cedo da garagem com o tanque cheio e a planilha em dia. Na bomba do patio o frentista anotou ' +
  'os litros, o motorista conferiu o hodometro e o mecanico olhou os pneus antes da obra. No escritorio o quadro ' +
  'do Friday mudou de cor, a engenharia marcou mais um LOTE e o cronograma andou uma semana. Ninguem viu o bicho ' +
  'que vive dentro do sistema e come as palavras que sobram no fim do dia.'
).split(' ');

type Palavra = { el: HTMLElement; x: number; y: number; w: number; h: number };

const seedDaUrl = (valor: string | null) => {
  const n = Number(valor);
  return valor !== null && Number.isInteger(n) ? n >>> 0 : Math.floor(Math.random() * 100000);
};

// Crawler: o bicho anda sobre o texto da janela, segue o cursor (ou a palavra mais perto), come as palavras e cresce.
// Quando acaba o texto, um "mini-LLM" (Markov de bigramas) escreve outro com o que ele comeu. `/dev?seed=N` repete o bicho.
export default function CrawlerToy() {
  const [busca] = useSearchParams();
  const seed = useMemo(() => seedDaUrl(busca.get('seed')), [busca]);
  const [palavras, setPalavras] = useState(TEXTO);
  const [versao, setVersao] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const alvos = useRef<Palavra[]>([]);
  const comidas = useRef<string[]>([]);
  const cursor = useRef<Vec | null>(null);
  const bicho = useRef<Crawler | null>(null);
  const reescrevendo = useRef(false);

  // Retângulos das palavras ainda não comidas, relativos à caixa (arrastar a janela não muda nada), em medidas
  // lógicas do canvas (px da tela ÷ ESCALA).
  const medir = useCallback(() => {
    const el = caixa.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    alvos.current = [...el.querySelectorAll<HTMLElement>('[data-w]:not(.dt-comida)')].map((s) => {
      const r = s.getBoundingClientRect();
      return { el: s, x: (r.left - base.left) / ESCALA, y: (r.top - base.top) / ESCALA, w: r.width / ESCALA, h: r.height / ESCALA };
    });
  }, []);

  useLayoutEffect(() => { medir(); }, [medir, versao]);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    void document.fonts?.ready.then(medir);
    // A animação do Desktop "ligando" escala a tela: medir durante ela dá retângulos errados.
    window.addEventListener('animationend', medir);
    return () => { ro.disconnect(); window.removeEventListener('animationend', medir); };
  }, [medir]);

  const desenhar: Desenhar = useCallback((ctx, { dt, largura, altura }) => {
    const c = (bicho.current ??= criarCrawler(paramsDaSeed(seed), largura / 2, altura / 2, seed));
    const cabeca = c.seg[0];

    let alvo = cursor.current;
    if (!alvo) {
      let melhor = Infinity;
      for (const p of alvos.current) {
        const centro = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
        const d = Math.hypot(centro.x - cabeca.x, centro.y - cabeca.y);
        if (d < melhor) { melhor = d; alvo = centro; }
      }
    }
    passo(c, dt, alvo, { largura, altura });

    // comeu? a palavra some (sem mudar o layout) e o bicho ganha um segmento
    const h = c.seg[0];
    const i = alvos.current.findIndex((p) => h.x >= p.x - FOLGA && h.x <= p.x + p.w + FOLGA && h.y >= p.y - FOLGA && h.y <= p.y + p.h + FOLGA);
    if (i >= 0) {
      const [p] = alvos.current.splice(i, 1);
      p.el.classList.add('dt-comida');
      comidas.current.push(p.el.textContent ?? '');
      crescer(c);
    }
    if (!alvos.current.length && !reescrevendo.current) {
      reescrevendo.current = true;
      window.setTimeout(() => {
        const novo = gerar(treinar(comidas.current), TEXTO.length, rngDe(seed + comidas.current.length));
        comidas.current = [];
        reescrevendo.current = false;
        setPalavras(novo.length ? novo : TEXTO);
        setVersao((n) => n + 1);
      }, ESPERA_NOVO_TEXTO_MS);
    }

    ctx.clearRect(0, 0, largura, altura);
    desenharCrawler(ctx, c);
  }, [seed]);

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    cursor.current = { x: (e.clientX - r.left) / ESCALA, y: (e.clientY - r.top) / ESCALA };
  };

  return (
    <div className="dt-crawler">
      <div className="dt-crawler-area" ref={caixa} onPointerMove={mover} onPointerLeave={() => { cursor.current = null; }} style={{ width: L * ESCALA, height: A * ESCALA }}>
        <p className="dt-crawler-texto" key={versao}>
          {palavras.map((w, i) => <span key={i}><span data-w>{w}</span> </span>)}
        </p>
        <CrtView largura={L} altura={A} desenhar={desenhar} transparente />
      </div>
      <p className="dt-crawler-rodape">SEED {seed} . /dev?seed={seed} repete o bicho</p>
    </div>
  );
}
