import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import CrtView, { type Desenhar } from '../../crt/CrtView';
import { ESCALA } from '../../escala';
import {
  EVENTO_VIVEIRO, FAMINTO, alimentar, atualizar, estagio, fomeAgora, gostei, gravarViveiro, lerViveiro, nomeDe,
  registrarXerox, type Criatura, type Resultado, type Viveiro,
} from './criaturas';
import { NOME_ESTAGIO, NOME_PLANO, paramsDe, proximoEstagio, visualDe } from './genoma';
import { efeitos, nivelDe, pontosLivres, SKILLS } from './habilidades';
import { gerar, treinar, type Estatisticas } from './markov';
import { acrescentar, gravarOpcoes, lerOpcoes, type OpcoesCrawler } from './memoria';
import { avaliar } from './nota';
import { boca, desenharCrawler, desenharRaio, distanciaAte } from './render';
import { criarCrawler, passo, rngDe, type Crawler, type Vec } from './sim';
import { embaralhar, QUEBRA, separarTextos } from './textos';
import bruto from './xerox.txt?raw';

const L = 480;
const A = 300;
const ESPERA_NOVO_TEXTO_MS = 1500;
const TEXTOS_POR_XEROX = 3;
const XEROX = { alvo: 60, maximo: 110 }; // palavras: a partir de 60, termina na primeira frase completa
const FONTE = 14; // px a 100%; diminui só quando o texto não cabe na janela
const FONTE_MIN = 7;
const LENTIDAO_FAMINTO = 0.6;
const AVISO_MS = 6000;

// "Xerox de um Xerox": textos escolhidos pelo responsável (copiados com autorização dele), sem acento nem aspas curvas.
const TEXTOS = separarTextos(bruto);

type Palavra = { el: HTMLElement; i: number; x: number; y: number; w: number; h: number };
type Fase = { tipo: 'texto'; n: number } | { tipo: 'xerox'; nota: number };

/** k-ésimo texto lido por um Crawler: cada volta pelos textos tem a sua ordem embaralhada pela seed dele. */
function textoDaVez(seed: number, k: number): string[] {
  const volta = Math.floor(k / TEXTOS.length);
  return TEXTOS[embaralhar(TEXTOS.length, rngDe(seed + volta * 7919))[k % TEXTOS.length]];
}

/** Quanto (rad, 0 a π) o Crawler precisa virar para apontar da boca até o centro da palavra. */
function voltaAte(c: Crawler, boca: Vec, p: Palavra): number {
  const a = Math.atan2(p.y + p.h / 2 - boca.y, p.x + p.w / 2 - boca.x) - c.ang;
  return Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
}

const ativaDe = (v: Viveiro) => v.criaturas.find((c) => c.id === v.ativa) ?? v.criaturas[0];

function avisoDe(r: Resultado, prefixo: string): string {
  const partes = [prefixo];
  if (r.evoluiu) partes.push(`EVOLUIU: ${NOME_ESTAGIO[r.evoluiu]}!`);
  if (r.mutou) partes.push(`MUTOU (${r.mutou})!`);
  if (r.subiu) partes.push(`NIVEL ${r.subiu}: +1 PONTO DE SKILL`);
  return partes.join(' . ');
}

// Crawler: a criatura ativa do Viveiro anda sobre o texto, para perto de uma palavra e a escaneia com um raio; a palavra
// lida fica apagada. Ciclo: 3 textos do "Xerox de um Xerox", depois um xerox do mini-LLM dela, com nota; a nota (e o
// "gostei") vira experiência, e a experiência, evolução. Faminta, anda devagar e o xerox não rende experiência.
export default function CrawlerToy() {
  const [criatura, setCriatura] = useState<Criatura>(() => ativaDe(lerViveiro()));
  const [palavras, setPalavras] = useState<string[]>(() => textoDaVez(criatura.seed, criatura.textosLidos));
  const [versao, setVersao] = useState(0);
  const [fase, setFase] = useState<Fase>({ tipo: 'texto', n: 1 });
  const [opcoes, setOpcoes] = useState<OpcoesCrawler>(lerOpcoes);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const [lidasNaPagina, setLidasNaPagina] = useState(0);

  const caixa = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLParagraphElement>(null);
  const alvos = useRef<Palavra[]>([]);
  const cursor = useRef<Vec | null>(null);
  const bicho = useRef<Crawler | null>(null);
  const cabeca = useRef<Vec | null>(null); // onde renasce depois de evoluir ou mutar
  const escaneando = useRef<Array<{ p: Palavra; progresso: number }>>([]); // uma ou mais (skill "Mais palavras")
  const reescrevendo = useRef(false);
  const pagina = useRef<Array<{ i: number; w: string }>>([]); // lidas no texto atual, com a posição de leitura
  const atual = useRef({ fase, opcoes, criatura });
  useEffect(() => { atual.current = { fase, opcoes, criatura }; }, [fase, opcoes, criatura]);

  const est = estagio(criatura);
  const visual = useMemo(() => visualDe(criatura.genoma, est, criatura.skills), [criatura.genoma, est, criatura.skills]);
  const corpo = useMemo(() => paramsDe(criatura.genoma, est, criatura.skills), [criatura.genoma, est, criatura.skills]);
  const forma = useRef({ visual, corpo });
  useEffect(() => {
    forma.current = { visual, corpo };
    bicho.current = null; // corpo novo (outro Crawler, evolução, mutação ou skill): renasce onde a cabeça estava
  }, [visual, corpo]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), AVISO_MS);
    return () => window.clearTimeout(t);
  }, [aviso]);
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  /**
   * O que foi lido no texto atual vira refeição e aprendizado (na ordem de leitura; o xerox só ensina se a opção
   * estiver ligada) e o Crawler é salvo no Viveiro.
   */
  const guardar = useCallback((base?: Criatura): Criatura => {
    let c = base ?? atual.current.criatura;
    if (pagina.current.length) {
      const lidas = [...pagina.current].sort((a, b) => a.i - b.i).map((p) => p.w);
      pagina.current = [];
      const { fase: f, opcoes: o } = atual.current;
      c = alimentar(c, lidas.length, Date.now());
      if (f.tipo === 'texto' || o.aprendeDeSi) c = { ...c, corpus: acrescentar(c.corpus, lidas) };
    }
    // antes de gravar: gravar dispara o evento do Viveiro, e quem reagir já precisa ver esta versão
    atual.current.criatura = c;
    gravarViveiro(atualizar(lerViveiro(), c));
    return c;
  }, []);
  useEffect(() => () => { guardar(); }, [guardar]);

  // Outro Crawler escolhido no Viveiro: guarda o atual e troca, começando de um texto novo.
  const trocando = useRef(false);
  useEffect(() => {
    const trocar = () => {
      if (trocando.current) return; // o próprio guardar() abaixo grava e dispara o evento de novo
      const proxima = ativaDe(lerViveiro());
      if (!proxima) return;
      if (proxima.id === atual.current.criatura.id) {
        // skill aprendida no Viveiro: o Crawler ativo passa a usá-la (e não a desfaz ao salvar)
        const agoraSkills = atual.current.criatura.skills;
        if (SKILLS.some((k) => proxima.skills[k] !== agoraSkills[k])) {
          const c = { ...atual.current.criatura, skills: proxima.skills };
          atual.current.criatura = c;
          setCriatura(c);
        }
        return;
      }
      trocando.current = true;
      try { guardar(); } finally { trocando.current = false; }
      escaneando.current = [];
      atual.current.criatura = proxima;
      setCriatura(proxima);
      setFase({ tipo: 'texto', n: 1 });
      setPalavras(textoDaVez(proxima.seed, proxima.textosLidos));
      setLidasNaPagina(0);
      setVersao((n) => n + 1);
      setAviso(`${nomeDe(proxima)} ENTROU`);
    };
    window.addEventListener(EVENTO_VIVEIRO, trocar);
    return () => window.removeEventListener(EVENTO_VIVEIRO, trocar);
  }, [guardar]);

  // Retângulos das palavras ainda não lidas, relativos à caixa (arrastar a janela não muda nada), em medidas lógicas
  // do canvas (px da tela ÷ ESCALA).
  const medir = useCallback(() => {
    const el = caixa.current;
    if (!el) return;
    const base = el.getBoundingClientRect();
    for (const s of escaneando.current) s.p.el.classList.remove('dt-escaneando');
    escaneando.current = [];
    alvos.current = [...el.querySelectorAll<HTMLElement>('[data-w]:not(.dt-lida)')].map((s) => {
      const r = s.getBoundingClientRect();
      return { el: s, i: Number(s.dataset.i), x: (r.left - base.left) / ESCALA, y: (r.top - base.top) / ESCALA, w: r.width / ESCALA, h: r.height / ESCALA };
    });
  }, []);

  // Texto novo: começa na fonte normal e diminui só até caber, depois mede as palavras.
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

  // Acabou o texto: 3 textos, depois um xerox (com nota e experiência), e assim por diante.
  const virarPagina = useCallback(() => {
    const f = atual.current.fase;
    let c = guardar();
    if (f.tipo === 'texto') c = { ...c, textosLidos: c.textosLidos + 1 };
    if (f.tipo === 'texto' && f.n >= TEXTOS_POR_XEROX) {
      // skill Revisor: escreve mais de um e fica com o de maior nota
      const rng = rngDe(c.seed + c.corpus.length + c.xeroxes * 31);
      const modelo = treinar(c.corpus);
      let novo: string[] = [];
      let nota = -1;
      for (let k = 0; k < efeitos(c.skills).rascunhos; k++) {
        const stats: Estatisticas = { tri: 0, bi: 0, recomeco: 0 };
        const rascunho = gerar(modelo, XEROX, rng, stats);
        const n = avaliar(rascunho, c.corpus, stats).nota;
        if (n > nota) { novo = rascunho; nota = n; }
      }
      const r = registrarXerox(c, novo.join(' '), nota, Date.now(), rng);
      c = r.criatura;
      setAviso(avisoDe(r, r.xp ? `+${r.xp} XP` : 'FAMINTO: SEM XP'));
      setFase({ tipo: 'xerox', nota });
      setPalavras(novo.length ? novo : textoDaVez(c.seed, c.textosLidos));
    } else {
      setFase({ tipo: 'texto', n: f.tipo === 'texto' ? f.n + 1 : 1 });
      setPalavras(textoDaVez(c.seed, c.textosLidos));
    }
    c = guardar(c);
    setCriatura(c);
    setLidasNaPagina(0);
    setAgora(Date.now());
    setVersao((v) => v + 1);
  }, [guardar]);

  const desenhar: Desenhar = useCallback((ctx, { dt, tempo, largura, altura }) => {
    const { visual: v, corpo: params } = forma.current;
    const inicio = cabeca.current ?? { x: largura / 2, y: altura / 2 };
    const c = (bicho.current ??= criarCrawler({ ...params }, inicio.x, inicio.y, atual.current.criatura.seed));
    const ef = efeitos(atual.current.criatura.skills);
    const faminto = fomeAgora(atual.current.criatura, Date.now()) - ef.fomePorPalavra * pagina.current.length >= FAMINTO;
    const alcance = v.alcance + ef.raio; // skill Raio longo
    c.params.velMax = params.velMax * ef.movimento * (faminto ? LENTIDAO_FAMINTO : 1);

    // as palavras em leitura continuam enquanto ao alcance (da boca até a borda delas); com vaga (skill "Mais
    // palavras"), pega as mais perto que estiverem ao alcance. Sem nenhuma ao alcance, vai até a mais perto.
    const b = boca(c, v);
    const lendo = escaneando.current.filter((s) => {
      const ok = distanciaAte(b, s.p) <= alcance;
      if (!ok) s.p.el.classList.remove('dt-escaneando');
      return ok;
    });
    let maisPerto: Palavra | null = null;
    if (lendo.length < ef.palavras) {
      const livres = alvos.current
        .filter((p) => !lendo.some((s) => s.p === p))
        .map((p) => ({ p, d: distanciaAte(b, p) }))
        .sort((x, y) => x.d - y.d);
      // para onde andar: a mais perto; com a skill Faro, cada radiano de volta conta como distância a mais
      let melhor = Infinity;
      for (const { p, d } of livres) {
        const custo = d + (ef.faro ? ef.faro * voltaAte(c, b, p) : 0);
        if (custo < melhor) { melhor = custo; maisPerto = p; }
      }
      for (const { p, d } of livres) {
        if (lendo.length >= ef.palavras || d > alcance) break;
        lendo.push({ p, progresso: 0 });
        p.el.classList.add('dt-escaneando');
      }
    }
    const foco = lendo[0]?.p ?? maisPerto;
    const centro = foco ? { x: foco.x + foco.w / 2, y: foco.y + foco.h / 2 } : null;

    // lendo, para; o cursor ainda pode puxá-lo (a leitura continua enquanto estiver ao alcance)
    if (cursor.current) passo(c, dt, cursor.current, { largura, altura });
    else passo(c, dt, centro, { largura, altura }, lendo.length > 0);

    const ritmo = dt * v.varredura * ef.leitura * (faminto ? LENTIDAO_FAMINTO : 1);
    escaneando.current = lendo.filter((s) => {
      s.progresso += ritmo / Math.max(2, s.p.el.textContent?.length ?? 2);
      if (s.progresso < 1) return true;
      const lida = s.p;
      lida.el.classList.remove('dt-escaneando');
      lida.el.classList.add('dt-lida');
      alvos.current = alvos.current.filter((p) => p !== lida);
      pagina.current.push({ i: lida.i, w: lida.el.textContent ?? '' });
      if (!atual.current.criatura.nasceu && pagina.current.length === 1) setAviso(`${nomeDe(atual.current.criatura)} CHOCOU!`);
      setLidasNaPagina(pagina.current.length);
      return false;
    });

    if (!alvos.current.length && !reescrevendo.current) {
      reescrevendo.current = true;
      window.setTimeout(() => { reescrevendo.current = false; virarPagina(); }, ESPERA_NOVO_TEXTO_MS);
    }

    cabeca.current = c.seg[0];
    ctx.clearRect(0, 0, largura, altura);
    for (const s of escaneando.current) desenharRaio(ctx, boca(c, v), s.p, s.progresso, tempo);
    desenharCrawler(ctx, c, v);
  }, [virarPagina]);

  const mover = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    cursor.current = { x: (e.clientX - r.left) / ESCALA, y: (e.clientY - r.top) / ESCALA };
  };

  const mudarOpcoes = (novas: OpcoesCrawler) => { setOpcoes(novas); gravarOpcoes(novas); };
  const darGostei = () => {
    const r = gostei(atual.current.criatura);
    if (!r.xp) return;
    setCriatura(guardar(r.criatura));
    setAviso(avisoDe(r, `+${r.xp} XP (GOSTEI)`));
  };
  const abrirViveiro = () => window.dispatchEvent(new CustomEvent('ledur:dev-abrir', { detail: 'viveiro' }));

  const fome = Math.max(0, Math.round(fomeAgora(criatura, agora) - efeitos(criatura.skills).fomePorPalavra * lidasNaPagina));
  const proximo = proximoEstagio(criatura.xp);
  const pontos = pontosLivres(criatura.xp, criatura.skills);
  const marca = (ligado: boolean) => `[${ligado ? 'x' : ' '}]`;

  return (
    <div className="dt-crawler">
      <div className="dt-crawler-area" ref={caixa} onPointerMove={mover} onPointerLeave={() => { cursor.current = null; }} style={{ width: L * ESCALA, height: A * ESCALA }}>
        <p className="dt-crawler-texto" ref={texto} key={versao}>
          {palavras.map((w, i) => (w === QUEBRA ? <br key={i} /> : <span key={i}><span data-w data-i={i}>{w}</span> </span>))}
        </p>
        <CrtView largura={L} altura={A} desenhar={desenhar} transparente />
      </div>
      <div className="dt-crawler-rodape">
        <p>
          {nomeDe(criatura)} . {NOME_PLANO[criatura.genoma.plano]} {NOME_ESTAGIO[est === 'ovo' ? 'larva' : est]} . NV {nivelDe(criatura.xp)}{pontos ? ` (+${pontos} SKILL)` : ''} . XP {Math.round(criatura.xp)}{proximo ? `/${proximo.xp}` : ''}
          {' '}. FOME {fome}{fome >= FAMINTO ? ' (FAMINTO)' : ''}
        </p>
        <p>
          {fase.tipo === 'texto' ? `TEXTO ${fase.n}/${TEXTOS_POR_XEROX}` : `XEROX ${criatura.xeroxes} . NOTA ${fase.nota}`}
          {aviso ? ` . ${aviso}` : ''}
        </p>
        {fase.tipo === 'xerox' && (
          <button type="button" onClick={darGostei} disabled={criatura.ultimo?.gostei}>
            {marca(criatura.ultimo?.gostei === true)} Gostei deste xerox
          </button>
        )}
        <button type="button" onClick={() => mudarOpcoes({ ...opcoes, aprendeDeSi: !opcoes.aprendeDeSi })}>
          {marca(opcoes.aprendeDeSi)} LLM aprende o proprio texto
        </button>
        <button type="button" onClick={abrirViveiro}>Setor de Contencao</button>
      </div>
    </div>
  );
}
