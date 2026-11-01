import { useEffect, useRef, useState } from 'react';
import { ESCALA } from '../../escala';
import {
  EVENTO_VIVEIRO, FAMINTO, MAX_CRIATURAS, chocar, estagio, fomeAgora, gravarViveiro, lerViveiro, nomeDe, novaSemente, soltar,
  type Criatura, type Viveiro,
} from '../crawler/criaturas';
import { NOME_ESTAGIO, paramsDe, proximoEstagio, visualDe } from '../crawler/genoma';
import { desenharCrawler, desenharOvo } from '../crawler/render';
import { criarCrawler } from '../crawler/sim';

const RL = 170; // retrato, px a 100%
const RA = 70;

// Retrato parado do Crawler (ou o ovo), desenhado conforme o genoma e o estágio.
function Retrato({ c }: { c: Criatura }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const px = Math.min(window.devicePixelRatio || 1, 2) * ESCALA;
    canvas.width = Math.round(RL * px);
    canvas.height = Math.round(RA * px);
    ctx.setTransform(px, 0, 0, px, 0, 0);
    ctx.clearRect(0, 0, RL, RA);
    const est = estagio(c);
    if (est === 'ovo') {
      desenharOvo(ctx, RL / 2, RA / 2, 0);
      return;
    }
    const p = paramsDe(c.genoma, est);
    const comprimento = (p.segmentos - 1) * p.dist;
    const k = Math.min(1, (RL - 30) / (comprimento + 30), (RA - 6) / ((p.coxa + p.canela) * 1.6 + 12));
    ctx.translate(RL / 2, RA / 2);
    ctx.scale(k, k);
    desenharCrawler(ctx, criarCrawler(p, comprimento / 2, 0, c.seed), visualDe(c.genoma, est));
  }, [c]);
  return <canvas ref={ref} style={{ width: RL * ESCALA, height: RA * ESCALA }} />;
}

const barra = (valor: number, total = 10) => {
  const cheio = Math.round(Math.min(1, Math.max(0, valor)) * total);
  return `[${'#'.repeat(cheio)}${'.'.repeat(total - cheio)}]`;
};

// Viveiro: os Crawlers deste navegador (até 6). Mostra estágio, experiência, fome e o último xerox; escolhe quem
// alimenta no Crawler, choca ovos e solta.
export default function ViveiroToy() {
  const [viveiro, setViveiro] = useState<Viveiro>(() => lerViveiro());
  const [agora, setAgora] = useState(() => Date.now());
  const [soltando, setSoltando] = useState<string | null>(null);

  useEffect(() => {
    const atualizar = () => { setViveiro(lerViveiro()); setAgora(Date.now()); };
    window.addEventListener(EVENTO_VIVEIRO, atualizar);
    const t = window.setInterval(() => setAgora(Date.now()), 30_000);
    return () => { window.removeEventListener(EVENTO_VIVEIRO, atualizar); window.clearInterval(t); };
  }, []);

  const mudar = (v: Viveiro) => gravarViveiro(v); // o evento atualiza esta janela e a do Crawler
  const alimentar = (id: string) => {
    mudar({ ...lerViveiro(), ativa: id });
    window.dispatchEvent(new CustomEvent('ledur:dev-abrir', { detail: 'crawler' }));
  };

  const vagas = MAX_CRIATURAS - viveiro.criaturas.length;
  return (
    <div className="dt-viveiro">
      {viveiro.criaturas.map((c) => {
        const est = estagio(c);
        const fome = fomeAgora(c, agora);
        const prox = proximoEstagio(c.xp);
        const ativa = c.id === viveiro.ativa;
        return (
          <section key={c.id} className={`dt-ficha${ativa ? ' dt-ficha-ativa' : ''}`}>
            <p className="dt-ficha-nome">{nomeDe(c)}{ativa ? ' . ALIMENTANDO' : ''}</p>
            <Retrato c={c} />
            <p>{NOME_ESTAGIO[est]} . XP {Math.round(c.xp)}{prox ? `/${prox.xp}` : ' (MAX)'}</p>
            <p>FOME {barra(fome / 100)}{fome >= FAMINTO ? ' FAMINTO' : ''}</p>
            <p>XEROX {c.xeroxes} . MELHOR NOTA {c.melhorNota} . LEU {c.corpus.length} PALAVRAS</p>
            {c.ultimo && (
              <p className="dt-ficha-xerox">
                &quot;{c.ultimo.texto.split(' ').slice(0, 14).join(' ')}...&quot; NOTA {c.ultimo.nota}{c.ultimo.gostei ? ' . GOSTEI' : ''}
              </p>
            )}
            <div className="dt-ficha-botoes">
              {!ativa && <button type="button" onClick={() => alimentar(c.id)}>[Alimentar]</button>}
              {soltando === c.id ? (
                <>
                  <span>Soltar?</span>
                  <button type="button" onClick={() => { setSoltando(null); mudar(soltar(lerViveiro(), c.id)); }}>[Sim]</button>
                  <button type="button" onClick={() => setSoltando(null)}>[Nao]</button>
                </>
              ) : (
                <button type="button" onClick={() => setSoltando(c.id)}>[Soltar]</button>
              )}
            </div>
          </section>
        );
      })}
      {vagas > 0 && (
        <section className="dt-ficha dt-ficha-vazia">
          <p>{vagas} {vagas === 1 ? 'VAGA' : 'VAGAS'}</p>
          <button type="button" onClick={() => mudar(chocar(lerViveiro(), novaSemente(), Date.now()))}>[Chocar ovo]</button>
        </section>
      )}
    </div>
  );
}
