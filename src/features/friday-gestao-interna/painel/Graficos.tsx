import { fmtNumero } from '../util.ts';
import type { Fatia, Resultado, Widget } from './calculo.ts';

// Gráficos do painel em SVG próprio (sem biblioteca). Cada barra/fatia mostra no "title" o valor e a quantidade.
export function fmtValor(v: number, w: Widget, unidade: string) {
  if (w.calculo === 'contagem') return v.toLocaleString('pt-BR');
  if (unidade === 'R$') return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  return fmtNumero(Math.round(v * 100) / 100, unidade);
}
// Rótulo curto para dentro do gráfico: 3,2 mi · 917 mil.
function compacto(v: number, w: Widget, unidade: string) {
  if (w.calculo === 'contagem') return v.toLocaleString('pt-BR');
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : a >= 1e4 ? `${Math.round(v / 1e3).toLocaleString('pt-BR')} mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return unidade === 'R$' ? `R$ ${s}` : s;
}
const dica = (f: Fatia, w: Widget, unidade: string) =>
  `${f.rotulo}: ${fmtValor(f.valor, w, unidade)}${w.calculo === 'contagem' ? '' : ` · ${f.n} ${f.n === 1 ? 'item' : 'itens'}`}`;

export function Grafico({ w, r }: { w: Widget; r: Resultado }) {
  if (w.tipo === 'numero') return <div className="pw-numero">{fmtValor(r.valor, w, r.unidade)}<small>{r.n} {r.n === 1 ? 'item' : 'itens'}</small></div>;
  if (!r.fatias.length) return <div className="pw-vazio">Nenhum item com dados para este gráfico.</div>;
  if (w.tipo === 'pizza') return <Pizza w={w} r={r} />;
  if (w.tipo === 'barras') return <Barras w={w} r={r} />;
  return <Colunas w={w} r={r} />;
}

function Pizza({ w, r }: { w: Widget; r: Resultado }) {
  const total = r.fatias.reduce((s, f) => s + Math.max(f.valor, 0), 0) || 1;
  let ang = -Math.PI / 2;
  const arco = (f: Fatia) => {
    const frac = Math.max(f.valor, 0) / total;
    const a0 = ang;
    ang += frac * 2 * Math.PI;
    if (frac >= 0.9999) return <circle key={f.chave} cx={0} cy={0} r={80} fill={f.cor}><title>{dica(f, w, r.unidade)}</title></circle>;
    const p = (a: number) => `${Math.cos(a) * 80} ${Math.sin(a) * 80}`;
    return <path key={f.chave} d={`M0 0 L${p(a0)} A80 80 0 ${frac > 0.5 ? 1 : 0} 1 ${p(ang)} Z`} fill={f.cor}><title>{dica(f, w, r.unidade)}</title></path>;
  };
  return (
    <div className="pw-pizza">
      <svg viewBox="-90 -90 180 180" role="img" aria-label={`Pizza: ${r.fatias.map(f => dica(f, w, r.unidade)).join('; ')}`}>
        {r.fatias.map(arco)}
        <circle cx={0} cy={0} r={46} className="pw-furo" />
      </svg>
      <ul className="pw-legenda">
        {r.fatias.map(f => (
          <li key={f.chave} title={dica(f, w, r.unidade)}>
            <span className="pw-cor" style={{ background: f.cor }} />
            <span className="pw-rotulo">{f.rotulo}</span>
            <span className="pw-num">{fmtValor(f.valor, w, r.unidade)}</span>
            <span className="pw-pct">{((Math.max(f.valor, 0) / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Colunas({ w, r }: { w: Widget; r: Resultado }) {
  const max = Math.max(...r.fatias.map(f => f.valor), 0) || 1;
  const n = r.fatias.length;
  const L = 600, A = 220, base = A - 34, larg = Math.min(56, (L - 20) / n - 8);
  return (
    <svg className="pw-colunas" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Colunas: ${r.fatias.map(f => dica(f, w, r.unidade)).join('; ')}`}>
      <line x1={10} x2={L - 10} y1={base} y2={base} className="pw-eixo" />
      {r.fatias.map((f, i) => {
        const x = 10 + ((L - 20) / n) * (i + 0.5);
        const h = (Math.max(f.valor, 0) / max) * (base - 30);
        return (
          <g key={f.chave}>
            <title>{dica(f, w, r.unidade)}</title>
            <rect x={x - larg / 2} y={base - h} width={larg} height={h} rx={3} fill={f.cor} />
            <text x={x} y={base - h - 6} className="pw-txt-valor">{compacto(f.valor, w, r.unidade)}</text>
            <text x={x} y={base + 16} className="pw-txt-eixo">{f.rotulo.length > 12 ? `${f.rotulo.slice(0, 11)}…` : f.rotulo}</text>
            {w.calculo !== 'contagem' && <text x={x} y={base + 29} className="pw-txt-n">{f.n} {f.n === 1 ? 'item' : 'itens'}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// Barras deitadas (cabem nomes longos, como pessoas), opcionalmente divididas pela coluna "pilha".
function Barras({ w, r }: { w: Widget; r: Resultado }) {
  const max = Math.max(...r.fatias.map(f => f.valor), 0) || 1;
  const legenda = [...new Map(r.fatias.flatMap(f => f.pilhas).map(p => [p.chave, p])).values()];
  return (
    <div className="pw-barras">
      {r.fatias.map(f => (
        <div key={f.chave} className="pw-barra-linha" title={dica(f, w, r.unidade)}>
          <span className="pw-rotulo">{f.rotulo}</span>
          <span className="pw-barra" style={{ width: `${(Math.max(f.valor, 0) / max) * 100}%` }}>
            {f.pilhas.length && w.calculo !== 'media'
              ? f.pilhas.map(p => <span key={p.chave} style={{ background: p.cor, flexGrow: Math.max(p.valor, 0) }} title={`${f.rotulo} · ${dica(p, w, r.unidade)}`} />)
              : <span style={{ background: f.cor, flexGrow: 1 }} />}
          </span>
          <span className="pw-num">{compacto(f.valor, w, r.unidade)}</span>
        </div>
      ))}
      {legenda.length > 0 && (
        <ul className="pw-legenda linha">
          {legenda.map(p => <li key={p.chave}><span className="pw-cor" style={{ background: p.cor }} />{p.rotulo}</li>)}
        </ul>
      )}
    </div>
  );
}
