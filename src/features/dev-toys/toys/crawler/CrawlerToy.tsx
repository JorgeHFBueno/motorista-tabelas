import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import CrtView, { type Desenhar } from '../../crt/CrtView';
import { ESCALA } from '../../escala';
import { gerar, treinar } from './markov';
import { acrescentar, apagarCorpus, gravarCorpus, gravarOpcoes, lerCorpus, lerOpcoes, type OpcoesCrawler } from './memoria';
import { desenharCrawler } from './render';
import { crescer, criarCrawler, paramsDaSeed, passo, rngDe, type Crawler, type Vec } from './sim';
import { embaralhar, QUEBRA, separarTextos } from './textos';
import bruto from './xerox.txt?raw';

const L = 480;
const A = 300;
const FOLGA = 2; // px em volta da palavra que ainda contam como "dentro"
const ESPERA_NOVO_TEXTO_MS = 1500;
const TEXTOS_POR_XEROX = 3;
const PALAVRAS_DO_XEROX = 80;
const FONTE = 14; // px a 100%; diminui só quando o texto não cabe na janela
const FONTE_MIN = 7;

// "Xerox de um Xerox": textos escolhidos pelo responsável (copiados com autorização dele), sem acento nem aspas curvas.
const TEXTOS = separarTextos(bruto);

type Palavra = { el: HTMLElement; x: number; y: number; w: number; h: number };
type Fase = { tipo: 'texto'; n: number } | { tipo: 'xerox' };

/** k-ésimo texto lido: cada volta pelos textos tem a sua ordem embaralhada pela seed, sem repetir dentro da volta. */
function textoDaVez(seed: number, k: number): string[] {
  const volta = Math.floor(k / TEXTOS.length);
  return TEXTOS[embaralhar(TEXTOS.length, rngDe(seed + volta * 7919))[k % TEXTOS.length]];
}

const seedDaUrl = (valor: string | null) => {
  const n = Number(valor);
  return valor !== null && Number.isInteger(n) ? n >>> 0 : Math.floor(Math.random() * 100000);
};

// Crawler: o bicho anda sobre o texto da janela, segue o cursor (ou a palavra mais perto), come as palavras e cresce.
// Ciclo: 3 textos do "Xerox de um Xerox", depois um texto escrito pelo mini-LLM (Markov de bigramas) com tudo o que
// ele já comeu, e de novo; o aprendizado nunca é zerado. `/dev?seed=N` repete o bicho e a ordem dos textos.
export default function CrawlerToy() {
  const [busca] = useSearchParams();
  const seed = useMemo(() => seedDaUrl(busca.get('seed')), [busca]);

  const lidos = useRef(1); // o texto 0 abre a janela
  const proximoTexto = useCallback(() => textoDaVez(seed, lidos.current++), [seed]);

  const [palavras, setPalavras] = useState<string[]>(() => textoDaVez(seed, 0));
  const [versao, setVersao] = useState(0);
  const [fase, setFase] = useState<Fase>({ tipo: 'texto', n: 1 });
  const [xerox, setXerox] = useState(0);
  const [opcoes, setOpcoes] = useState<OpcoesCrawler>(lerOpcoes);
  const [tamanho, setTamanho] = useState(0);

  const caixa = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLParagraphElement>(null);
  const alvos = useRef<Palavra[]>([]);
  const cursor = useRef<Vec | null>(null);
  const bicho = useRef<Crawler | null>(null);
  const reescrevendo = useRef(false);
  const corpus = useRef<string[]>([]);
  const atual = useRef({ fase, xerox, opcoes });
  useEffect(() => { atual.current = { fase, xerox, opcoes }; }, [fase, xerox, opcoes]);

  // aprendizado guardado neste navegador (se a opção estiver ligada)
  useEffect(() => {
    if (!lerOpcoes().guardar) return;
    corpus.current = lerCorpus();
    setTamanho(corpus.current.length);
  }, []);
  const guardar = useCallback(() => { if (atual.current.opcoes.guardar) gravarCorpus(corpus.current); }, []);
  useEffect(() => guardar, [guardar]);

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

  // Texto novo: começa na fonte normal e diminui só até caber (textos longos e poemas), depois mede as palavras.
  useLayoutEffect(() => {
    const p = texto.current;
    if (p) {
      for (let f = FONTE; f >= FONTE_MIN; f -= 0.5) {
        p.style.fontSize = `calc(var(--dt-e) * ${f}px)`;
        if (p.scrollHeight <= p.clientHeight) break;
      }
    }
    medir();
  }, [medir, versao]);

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

  // Acabou o texto: 3 textos, depois um xerox do LLM, e assim por diante.
  const virarPagina = useCallback(() => {
    guardar();
    const f = atual.current.fase;
    if (f.tipo === 'texto' && f.n < TEXTOS_POR_XEROX) {
      setFase({ tipo: 'texto', n: f.n + 1 });
      setPalavras(proximoTexto());
    } else if (f.tipo === 'texto') {
      const n = atual.current.xerox + 1;
      setFase({ tipo: 'xerox' });
      setXerox(n);
      setPalavras(gerar(treinar(corpus.current), PALAVRAS_DO_XEROX, rngDe(seed + corpus.current.length + n)));
    } else {
      setFase({ tipo: 'texto', n: 1 });
      setPalavras(proximoTexto());
    }
    setVersao((v) => v + 1);
  }, [guardar, proximoTexto, seed]);

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

    // comeu? a palavra some (sem mudar o layout), o bicho ganha um segmento e o LLM aprende a palavra
    const h = c.seg[0];
    const i = alvos.current.findIndex((p) => h.x >= p.x - FOLGA && h.x <= p.x + p.w + FOLGA && h.y >= p.y - FOLGA && h.y <= p.y + p.h + FOLGA);
    if (i >= 0) {
      const [p] = alvos.current.splice(i, 1);
      p.el.classList.add('dt-comida');
      crescer(c);
      const { fase: f, opcoes: o } = atual.current;
      if (f.tipo === 'texto' || o.aprendeDeSi) {
        corpus.current = acrescentar(corpus.current, [p.el.textContent ?? '']);
        setTamanho(corpus.current.length);
      }
    }
    if (!alvos.current.length && !reescrevendo.current) {
      reescrevendo.current = true;
      window.setTimeout(() => { reescrevendo.current = false; virarPagina(); }, ESPERA_NOVO_TEXTO_MS);
    }

    ctx.clearRect(0, 0, largura, altura);
    desenharCrawler(ctx, c);
  }, [seed, virarPagina]);

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    cursor.current = { x: (e.clientX - r.left) / ESCALA, y: (e.clientY - r.top) / ESCALA };
  };

  const mudarOpcoes = (novas: OpcoesCrawler) => {
    setOpcoes(novas);
    gravarOpcoes(novas);
    if (novas.guardar) gravarCorpus(corpus.current);
    else apagarCorpus(); // desligado: some do navegador, mas continua valendo enquanto a janela estiver aberta
  };
  const marca = (ligado: boolean) => `[${ligado ? 'x' : ' '}]`;

  return (
    <div className="dt-crawler">
      <div className="dt-crawler-area" ref={caixa} onPointerMove={mover} onPointerLeave={() => { cursor.current = null; }} style={{ width: L * ESCALA, height: A * ESCALA }}>
        <p className="dt-crawler-texto" ref={texto} key={versao}>
          {palavras.map((w, i) => (w === QUEBRA ? <br key={i} /> : <span key={i}><span data-w>{w}</span> </span>))}
        </p>
        <CrtView largura={L} altura={A} desenhar={desenhar} transparente />
      </div>
      <div className="dt-crawler-rodape">
        <p>
          {fase.tipo === 'texto' ? `TEXTO ${fase.n}/${TEXTOS_POR_XEROX}` : `XEROX ${xerox}`} . LLM {tamanho} PALAVRAS . SEED {seed}
        </p>
        <button type="button" onClick={() => mudarOpcoes({ ...opcoes, aprendeDeSi: !opcoes.aprendeDeSi })}>
          {marca(opcoes.aprendeDeSi)} LLM aprende o proprio texto
        </button>
        <button type="button" onClick={() => mudarOpcoes({ ...opcoes, guardar: !opcoes.guardar })}>
          {marca(opcoes.guardar)} Guardar aprendizado
        </button>
      </div>
    </div>
  );
}
