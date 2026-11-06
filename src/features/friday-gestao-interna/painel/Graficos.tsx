import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { corTexto, fmtNumero } from '../util.ts';
import { blocosDoTexto, escalaEixo, GRUPO, mesPorExtenso, type Fatia, type Intervalo, type LinhaTabela, type ParteTexto, type Resultado, type Widget } from './calculo.ts';

export type Selecao = { chave?: string; pilha?: string; bucket?: Intervalo; titulo: string };
type Props = { w: Widget; r: Resultado; classica?: boolean; onAbrir?: (s: Selecao) => void; onItem?: (quadroId: number, itemId: number) => void };

const ehReal = (unidade: string) => unidade.trim() === 'R$';
// Gráficos do painel em SVG próprio (sem biblioteca). Cada barra/fatia mostra no "title" o valor e a quantidade.
export function fmtValor(v: number, w: Widget, unidade: string) {
  if (w.calculo === 'contagem') return v.toLocaleString('pt-BR');
  if (ehReal(unidade)) return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
  return fmtNumero(Math.round(v * 100) / 100, unidade);
}
// Rótulo curto para dentro do gráfico: 3,2 mi · 917 mil.
function compacto(v: number, w: Widget, unidade: string) {
  if (w.calculo === 'contagem') return v.toLocaleString('pt-BR');
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : a >= 1e4 ? `${Math.round(v / 1e3).toLocaleString('pt-BR')} mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return ehReal(unidade) ? `R$ ${s}` : s;
}
const dica = (f: Fatia, w: Widget, unidade: string) =>
  `${f.rotulo}: ${fmtValor(f.valor, w, unidade)}${w.calculo === 'contagem' ? '' : ` · ${f.n} ${f.n === 1 ? 'item' : 'itens'}`}`;

// Elemento clicável (também pelo teclado), só quando há onde abrir.
const clicavel = (fn?: () => void) => (fn ? {
  role: 'button', tabIndex: 0, 'data-clicavel': true,
  onClick: (e: MouseEvent) => { e.stopPropagation(); fn(); },
  onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fn(); } },
} : {});
const pct = (v: number, casas = 1) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`;
const curto = (s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s);

export function Grafico(p: Props) {
  const { w, r } = p;
  switch (w.tipo) {
    case 'texto': return w.texto ? <TextoWidget texto={w.texto} /> : <div className="pw-texto"><span className="muted">Sem texto.</span></div>;
    case 'numero': return <Numero {...p} />;
    case 'matriz': return <Matriz {...p} />;
    case 'lista': return <Lista {...p} />;
    case 'carga': return <Carga {...p} />;
    case 'funil': return <Funil {...p} />;
  }
  if (!r.fatias.length) return <div className="pw-vazio">Nenhum item com dados para este gráfico.</div>;
  switch (w.tipo) {
    case 'pizza': return <Pizza {...p} />;
    case 'barras': return <Barras {...p} />;
    case 'linha': return <Linha {...p} />;
    case 'bateria': return <Bateria {...p} />;
    case 'pivo': return <Pivo {...p} />;
    default: return p.classica || w.comQuantidade ? <ColunasComEixo {...p} /> : <Colunas {...p} />;
  }
}

const Partes = ({ partes }: { partes: ParteTexto[] }) => <>{partes.map((p, i) => (p.negrito ? <strong key={i}>{p.texto}</strong> : <span key={i}>{p.texto}</span>))}</>;

function TextoWidget({ texto }: { texto: string }) {
  const blocos = blocosDoTexto(texto);
  const saida: ReactNode[] = [];
  for (let i = 0; i < blocos.length; i++) {
    const b = blocos[i];
    if (b.tipo === 'titulo') saida.push(<h4 key={i} className="pw-texto-titulo"><Partes partes={b.partes} /></h4>);
    else if (b.tipo === 'paragrafo') saida.push(<p key={i}><Partes partes={b.partes} /></p>);
    else {
      const itens = [];
      for (; i < blocos.length && blocos[i].tipo === 'item'; i++) itens.push(<li key={i}><Partes partes={blocos[i].partes} /></li>);
      i--;
      saida.push(<ul key={`l${i}`}>{itens}</ul>);
    }
  }
  return <div className="pw-texto formatado">{saida}</div>;
}

function Numero({ w, r, onAbrir }: Props) {
  const c = r.comparacao;
  const seta = !c || c.variacao == null ? '' : c.variacao > 0 ? '▲' : c.variacao < 0 ? '▼' : '=';
  return (
    <div className="pw-numero" {...clicavel(onAbrir && (() => onAbrir({ titulo: w.titulo })))}>
      {fmtValor(r.valor, w, r.unidade)}
      <small>{r.n} {r.n === 1 ? 'item' : 'itens'}</small>
      {c && (
        <span className={`pw-variacao${!c.variacao ? '' : c.variacao > 0 ? ' sobe' : ' desce'}`} title={`Anterior (${c.rotulo}): ${fmtValor(c.anterior, w, r.unidade)}`}>
          {c.variacao == null ? 'Sem base para comparar' : `${seta} ${pct(Math.abs(c.variacao))}`}
          <em> {w.comparar === 'ano_anterior' ? 'sobre o ano anterior' : 'sobre o período anterior'}</em>
        </span>
      )}
      {r.serie && <Tendencia serie={r.serie} w={w} unidade={r.unidade} />}
    </div>
  );
}

function Tendencia({ serie, w, unidade }: { serie: NonNullable<Resultado['serie']>; w: Widget; unidade: string }) {
  const L = 200, A = 40;
  const min = Math.min(...serie.map(s => s.valor)), max = Math.max(...serie.map(s => s.valor));
  const x = (i: number) => 4 + (i / (serie.length - 1)) * (L - 8);
  const y = (v: number) => (max === min ? A / 2 : A - 5 - ((v - min) / (max - min)) * (A - 10));
  return (
    <svg className="pw-tendencia" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Últimos meses: ${serie.map(s => `${s.rotulo} ${fmtValor(s.valor, w, unidade)}`).join('; ')}`}>
      <polyline points={serie.map((s, i) => `${x(i)},${y(s.valor)}`).join(' ')} />
      {serie.map((s, i) => <circle key={s.chave} cx={x(i)} cy={y(s.valor)} r={i === serie.length - 1 ? 3 : 2}><title>{s.rotulo}: {fmtValor(s.valor, w, unidade)}</title></circle>)}
    </svg>
  );
}

function Pizza({ w, r, classica, onAbrir }: Props) {
  const total = r.fatias.reduce((s, f) => s + Math.max(f.valor, 0), 0) || 1;
  let ang = -Math.PI / 2;
  const abrir = (f: Fatia) => onAbrir && (() => onAbrir({ chave: f.chave, titulo: `${w.titulo}: ${f.rotulo}` }));
  const arco = (f: Fatia) => {
    const frac = Math.max(f.valor, 0) / total;
    const a0 = ang;
    ang += frac * 2 * Math.PI;
    if (frac >= 0.9999) return <circle key={f.chave} cx={0} cy={0} r={80} fill={f.cor} {...clicavel(abrir(f))}><title>{dica(f, w, r.unidade)}</title></circle>;
    const p = (a: number) => `${Math.cos(a) * 80} ${Math.sin(a) * 80}`;
    return <path key={f.chave} d={`M0 0 L${p(a0)} A80 80 0 ${frac > 0.5 ? 1 : 0} 1 ${p(ang)} Z`} fill={f.cor} {...clicavel(abrir(f))}><title>{dica(f, w, r.unidade)}</title></path>;
  };
  return (
    <div className="pw-pizza">
      <svg viewBox="-90 -90 180 180" role="img" aria-label={`Pizza: ${r.fatias.map(f => dica(f, w, r.unidade)).join('; ')}`}>
        {r.fatias.map(arco)}
        {!classica && <circle cx={0} cy={0} r={46} className="pw-furo" />}
      </svg>
      <ul className="pw-legenda">
        {r.fatias.map(f => (
          <li key={f.chave} title={dica(f, w, r.unidade)} {...clicavel(abrir(f))}>
            <span className="pw-cor" style={{ background: f.cor }} />
            {classica
              ? <span className="pw-rotulo">{f.rotulo}: {((Math.max(f.valor, 0) / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</span>
              : <>
                <span className="pw-rotulo">{f.rotulo}</span>
                <span className="pw-num">{fmtValor(f.valor, w, r.unidade)}</span>
                <span className="pw-pct">{((Math.max(f.valor, 0) / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>
              </>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const LegendaPilhas = ({ r }: { r: Resultado }) => (r.pilhasColunas?.length ? (
  <ul className="pw-legenda linha">{r.pilhasColunas.map(p => <li key={p.chave}><span className="pw-cor" style={{ background: p.cor }} />{p.rotulo}</li>)}</ul>
) : null);

// De quantos em quantos rótulos mostrar no eixo, para não embolar.
const passoRotulo = (n: number, L: number) => Math.max(1, Math.ceil(n / Math.floor(L / 62)));

const COR_QUANTIDADE = '#579bfc';
const COR_VALOR = '#ffcb00';

// Colunas com eixo Y, linhas de grade e o valor inteiro em cada coluna (aparência clássica). Com comQuantidade, duas por grupo:
// a quantidade tem escala própria, no eixo da direita (na mesma escala do valor em R$, a barra dela some).
function ColunasComEixo({ w, r, onAbrir }: Props) {
  const dupla = !!w.comQuantidade && w.calculo !== 'contagem';
  const empilha = !!w.pilha && w.calculo !== 'media' && !dupla;
  const real = ehReal(r.unidade) && w.calculo !== 'contagem';
  const rotulos = r.fatias.map(f => mesPorExtenso(f.rotulo));
  const { topo, passo } = escalaEixo(Math.max(...r.fatias.map(f => f.valor), 0), w.calculo === 'contagem');
  const escalaQ = escalaEixo(Math.max(...r.fatias.map(f => f.n), 0), true);
  const marcasQ = dupla ? Array.from({ length: Math.round(escalaQ.topo / escalaQ.passo) + 1 }, (_, i) => i * escalaQ.passo) : [];
  const tick = (v: number) => (real ? `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}` : v.toLocaleString('pt-BR'));
  const rotuloValor = (v: number) => (real ? `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : fmtValor(v, w, r.unidade));
  const marcas = Array.from({ length: Math.round(topo / passo) + 1 }, (_, i) => i * passo);
  const n = r.fatias.length;
  const L = w.largo ? 1240 : 640;
  const esq = 34 + Math.max(...marcas.map(m => tick(m).length)) * 6.6;
  const dir = dupla ? 34 + Math.max(...marcasQ.map(m => m.toLocaleString('pt-BR').length)) * 6.6 : 28;
  const area = (L - esq - dir) / n;
  const deitado = rotulos.some(t => t.length * 6.6 > area);
  const maiorRotulo = Math.max(...rotulos.map(t => Math.min(t.length, 24)));
  const baixo = deitado ? maiorRotulo * 5 + 20 : 26;
  const A = 320 + baixo;
  const base = A - baixo;
  const altura = (v: number) => (Math.max(v, 0) / topo) * (base - 26);
  const alturaQ = (v: number) => (Math.max(v, 0) / escalaQ.topo) * (base - 26);
  const titulo = w.calculo === 'contagem' ? 'Quantidade' : w.valor ?? '';
  return (
    <>
      <svg className="pw-colunas pw-com-eixo" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Colunas: ${r.fatias.map(f => dica(f, w, r.unidade)).join('; ')}`}>
        <text x={12} y={(base + 26) / 2} className="pw-txt-eixo" transform={`rotate(-90 12 ${(base + 26) / 2})`}>{titulo}</text>
        {marcas.map(m => (
          <g key={m}>
            <line x1={esq} x2={L - 4} y1={base - altura(m)} y2={base - altura(m)} className="pw-grade" />
            <text x={esq - 8} y={base - altura(m) + 4} className="pw-txt-eixo fim">{tick(m)}</text>
          </g>
        ))}
        {dupla && (
          <>
            {marcasQ.map(m => <text key={m} x={L - dir + 8} y={base - alturaQ(m) + 4} className="pw-txt-eixo inicio">{m.toLocaleString('pt-BR')}</text>)}
            <text x={L - 12} y={(base + 26) / 2} className="pw-txt-eixo" transform={`rotate(90 ${L - 12} ${(base + 26) / 2})`}>Quantidade</text>
          </>
        )}
        {r.fatias.map((f, i) => {
          const x = esq + area * (i + 0.5);
          const abrir = !empilha && onAbrir ? () => onAbrir({ chave: f.chave, titulo: `${w.titulo}: ${f.rotulo}` }) : undefined;
          const eixo = rotulos[i].length > 24 ? `${rotulos[i].slice(0, 23)}…` : rotulos[i];
          let topoPilha = base;
          const largura = dupla ? Math.min(area * 0.3, 40) : Math.min(area * 0.62, 110);
          return (
            <g key={f.chave} {...clicavel(abrir)}>
              <title>{dica(f, w, r.unidade)}</title>
              {dupla && (
                <>
                  <rect x={x - largura - 1} y={base - alturaQ(f.n)} width={largura} height={alturaQ(f.n)} rx={3} fill={COR_QUANTIDADE} />
                  <text x={x - largura / 2 - 1} y={base - alturaQ(f.n) - 6} className="pw-txt-valor">{f.n.toLocaleString('pt-BR')}</text>
                  <rect x={x + 1} y={base - altura(f.valor)} width={largura} height={altura(f.valor)} rx={3} fill={COR_VALOR} />
                </>
              )}
              {!dupla && empilha && f.pilhas.map(p => {
                const h = altura(p.valor);
                topoPilha -= h;
                return (
                  <g key={p.chave} {...clicavel(onAbrir && (() => onAbrir({ chave: f.chave, pilha: p.chave, titulo: `${w.titulo}: ${f.rotulo} · ${p.rotulo}` })))}>
                    <title>{f.rotulo} · {dica(p, w, r.unidade)}</title>
                    <rect x={x - largura / 2} y={topoPilha} width={largura} height={h} fill={p.cor} />
                    {h >= 16 && <text x={x} y={topoPilha + h / 2 + 4} className="pw-txt-valor" style={{ fill: corTexto(p.cor) }}>{fmtValor(p.valor, w, r.unidade)}</text>}
                  </g>
                );
              })}
              {!dupla && !(empilha && f.pilhas.length) && <rect x={x - largura / 2} y={base - altura(f.valor)} width={largura} height={altura(f.valor)} rx={3} fill={f.cor} />}
              <text x={dupla ? x + largura / 2 + 1 : x} y={base - altura(f.valor) - 6} className="pw-txt-valor">{rotuloValor(f.valor)}</text>
              {deitado
                ? <text x={x + 4} y={base + 14} className="pw-txt-eixo fim" transform={`rotate(-45 ${x + 4} ${base + 14})`}>{eixo}</text>
                : <text x={x} y={base + 18} className="pw-txt-eixo">{eixo}</text>}
            </g>
          );
        })}
      </svg>
      {dupla && (
        <ul className="pw-legenda linha">
          <li><span className="pw-cor" style={{ background: COR_QUANTIDADE }} />Quantidade</li>
          <li><span className="pw-cor" style={{ background: COR_VALOR }} />{w.valor}</li>
        </ul>
      )}
      {empilha && <LegendaPilhas r={r} />}
    </>
  );
}

function Colunas({ w, r, onAbrir }: Props) {
  const max = Math.max(...r.fatias.map(f => f.valor), 0) || 1;
  const n = r.fatias.length;
  const L = w.largo ? 900 : 340, A = 220, base = A - 34, larg = Math.min(56, Math.max(4, (L - 20) / n - 8));
  const folga = (L - 20) / n;
  const passo = passoRotulo(n, L);
  const empilha = !!w.pilha && w.calculo !== 'media';
  return (
    <>
      <svg className="pw-colunas" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Colunas: ${r.fatias.map(f => dica(f, w, r.unidade)).join('; ')}`}>
        <line x1={10} x2={L - 10} y1={base} y2={base} className="pw-eixo" />
        {r.fatias.map((f, i) => {
          const x = 10 + ((L - 20) / n) * (i + 0.5);
          const h = (Math.max(f.valor, 0) / max) * (base - 30);
          const total = f.pilhas.reduce((s, p) => s + Math.max(p.valor, 0), 0) || 1;
          let topo = base;
          return (
            <g key={f.chave} {...clicavel(!empilha && onAbrir ? () => onAbrir({ chave: f.chave, titulo: `${w.titulo}: ${f.rotulo}` }) : undefined)}>
              <title>{dica(f, w, r.unidade)}</title>
              {empilha && f.pilhas.length
                ? f.pilhas.map(p => {
                  const hp = (Math.max(p.valor, 0) / total) * h;
                  topo -= hp;
                  return <rect key={p.chave} x={x - larg / 2} y={topo} width={larg} height={hp} fill={p.cor} {...clicavel(onAbrir && (() => onAbrir({ chave: f.chave, pilha: p.chave, titulo: `${w.titulo}: ${f.rotulo} · ${p.rotulo}` })))}><title>{f.rotulo} · {dica(p, w, r.unidade)}</title></rect>;
                })
                : <rect x={x - larg / 2} y={base - h} width={larg} height={h} rx={3} fill={f.cor} />}
              {folga >= 26 && <text x={x} y={base - h - 6} className="pw-txt-valor">{compacto(f.valor, w, r.unidade)}</text>}
              {i % passo === 0 && <text x={x} y={base + 16} className="pw-txt-eixo">{curto(f.rotulo)}</text>}
              {w.calculo !== 'contagem' && folga >= 48 && <text x={x} y={base + 29} className="pw-txt-n">{f.n} {f.n === 1 ? 'item' : 'itens'}</text>}
            </g>
          );
        })}
      </svg>
      {empilha && <LegendaPilhas r={r} />}
    </>
  );
}

function Linha({ w, r, onAbrir }: Props) {
  const L = w.largo ? 900 : 340, A = 220, base = A - 28, n = r.fatias.length;
  const folga = (L - 56) / Math.max(n - 1, 1);
  const series = w.pilha && r.pilhasColunas?.length
    ? r.pilhasColunas.map(p => ({ chave: p.chave, rotulo: p.rotulo, cor: p.cor, valores: r.fatias.map(f => f.pilhas.find(x => x.chave === p.chave)?.valor ?? 0) }))
    : [{ chave: '', rotulo: '', cor: '#579bfc', valores: r.fatias.map(f => f.valor) }];
  const max = Math.max(...series.flatMap(s => s.valores), 0) || 1;
  const x = (i: number) => (n === 1 ? L / 2 : 28 + (i / (n - 1)) * (L - 56));
  const y = (v: number) => base - (Math.max(v, 0) / max) * (base - 26);
  const passo = passoRotulo(n, L);
  return (
    <>
      <svg className="pw-colunas pw-linha" viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Linha: ${r.fatias.map(f => dica(f, w, r.unidade)).join('; ')}`}>
        <line x1={10} x2={L - 10} y1={base} y2={base} className="pw-eixo" />
        {series.map(s => <polyline key={s.chave} points={s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')} style={{ stroke: s.cor }} />)}
        {series.map(s => s.valores.map((v, i) => {
          const f = r.fatias[i];
          return (
            <g key={`${s.chave}-${f.chave}`} {...clicavel(onAbrir && (() => onAbrir({ chave: f.chave, pilha: s.chave || undefined, titulo: `${w.titulo}: ${f.rotulo}${s.rotulo ? ` · ${s.rotulo}` : ''}` })))}>
              <title>{f.rotulo}{s.rotulo ? ` · ${s.rotulo}` : ''}: {fmtValor(v, w, r.unidade)}</title>
              <circle cx={x(i)} cy={y(v)} r={4} style={{ fill: s.cor }} />
              {series.length === 1 && folga >= 26 && <text x={x(i)} y={y(v) - 9} className="pw-txt-valor">{compacto(v, w, r.unidade)}</text>}
            </g>
          );
        }))}
        {r.fatias.map((f, i) => (i % passo === 0 ? <text key={f.chave} x={x(i)} y={base + 16} className="pw-txt-eixo">{curto(f.rotulo)}</text> : null))}
      </svg>
      {series.length > 1 && <LegendaPilhas r={r} />}
    </>
  );
}

// Barras deitadas (cabem nomes longos, como pessoas), opcionalmente divididas pela coluna "pilha".
function Barras({ w, r, onAbrir }: Props) {
  const max = Math.max(...r.fatias.map(f => f.valor), 0) || 1;
  return (
    <div className="pw-barras">
      {r.fatias.map(f => {
        const dividir = f.pilhas.length > 0 && w.calculo !== 'media';
        return (
          <div key={f.chave} className="pw-barra-linha" title={dica(f, w, r.unidade)} {...clicavel(!dividir && onAbrir ? () => onAbrir({ chave: f.chave, titulo: `${w.titulo}: ${f.rotulo}` }) : undefined)}>
            <span className="pw-rotulo">{f.rotulo}</span>
            <span className="pw-barra" style={{ width: `${(Math.max(f.valor, 0) / max) * 100}%` }}>
              {dividir
                ? f.pilhas.map(p => <span key={p.chave} style={{ background: p.cor, flexGrow: Math.max(p.valor, 0) }} title={`${f.rotulo} · ${dica(p, w, r.unidade)}`} {...clicavel(onAbrir && (() => onAbrir({ chave: f.chave, pilha: p.chave, titulo: `${w.titulo}: ${f.rotulo} · ${p.rotulo}` })))} />)
                : <span style={{ background: f.cor, flexGrow: 1 }} />}
            </span>
            <span className="pw-num">{compacto(f.valor, w, r.unidade)}</span>
          </div>
        );
      })}
      {w.pilha && w.calculo !== 'media' && <LegendaPilhas r={r} />}
    </div>
  );
}

function Bateria({ w, r, onAbrir }: Props) {
  const f = r.feito ?? { valor: 0, total: 0, pct: 0 };
  return (
    <div className="pw-bateria">
      <div className="pw-bateria-num">{pct(f.pct)}<small>feito · {fmtValor(f.valor, w, r.unidade)} de {fmtValor(f.total, w, r.unidade)}</small></div>
      <div className="pw-bateria-barra">
        {r.fatias.map(x => <span key={x.chave} style={{ background: x.cor, flexGrow: Math.max(x.valor, 0) }} title={dica(x, w, r.unidade)} {...clicavel(onAbrir && (() => onAbrir({ chave: x.chave, titulo: `${w.titulo}: ${x.rotulo}` })))} />)}
      </div>
      <ul className="pw-legenda linha">
        {r.fatias.map(x => <li key={x.chave}><span className="pw-cor" style={{ background: x.cor }} />{x.rotulo} {fmtValor(x.valor, w, r.unidade)}</li>)}
      </ul>
      {f.total > 0 && !f.valor && !w.feito?.length && <p className="muted small">Nenhum rótulo está marcado como concluído: escolha em Editar quais contam como feito.</p>}
    </div>
  );
}

function Funil({ w, r, onAbrir }: Props) {
  const etapas = r.funil ?? [];
  if (!etapas.length) return <div className="pw-vazio">Escolha as etapas do funil.</div>;
  const max = Math.max(...etapas.map(e => e.acumulado), 0) || 1;
  const fim = etapas[etapas.length - 1], inicio = etapas[0];
  const acumula = w.acumular !== false && w.calculo !== 'media';
  return (
    <div className="pw-funil">
      {etapas.map(e => (
        <div key={e.chave} className="pw-funil-linha" title={`${e.rotulo}: ${fmtValor(e.proprio, w, r.unidade)} nesta etapa`} {...clicavel(onAbrir && (() => onAbrir({ chave: e.chave, titulo: `${w.titulo}: ${e.rotulo}` })))}>
          <span className="pw-rotulo">{e.rotulo}</span>
          <span className="pw-funil-trilho"><span style={{ width: `${Math.max((e.acumulado / max) * 100, e.acumulado ? 2 : 0)}%`, background: e.cor }} /></span>
          <span className="pw-num">{compacto(e.acumulado, w, r.unidade)}</span>
          <span className="pw-pct">{e.conversao == null ? '' : pct(e.conversao)}</span>
        </div>
      ))}
      <p className="muted small">
        {inicio.acumulado ? `Do início ao fim: ${pct((fim.acumulado / inicio.acumulado) * 100)}. ` : ''}
        {acumula ? 'Cada etapa soma quem já passou dela. O % é a passagem desde a etapa anterior.' : 'O % compara com a etapa anterior.'}
      </p>
      {!!r.foraFunil?.length && <p className="muted small">Fora do funil: {r.foraFunil.map(f => `${f.rotulo} ${fmtValor(f.valor, w, r.unidade)}`).join(' · ')}</p>}
    </div>
  );
}

function Pivo({ w, r, onAbrir }: Props) {
  const cols = r.pilhasColunas ?? [];
  const maior = Math.max(0, ...r.fatias.flatMap(f => f.pilhas.map(p => p.valor)));
  return (
    <div className="pw-tabela-rola">
      <table className="pw-tabela">
        <thead><tr><th>{w.eixo === GRUPO ? 'Grupo' : w.eixo}</th>{cols.map(c => <th key={c.chave} className="num">{c.rotulo}</th>)}<th className="num">Total</th></tr></thead>
        <tbody>
          {r.fatias.map(f => (
            <tr key={f.chave}>
              <th {...clicavel(onAbrir && (() => onAbrir({ chave: f.chave, titulo: `${w.titulo}: ${f.rotulo}` })))}>{f.rotulo}</th>
              {cols.map(c => {
                const p = f.pilhas.find(x => x.chave === c.chave);
                return (
                  <td key={c.chave} className="num" style={p && maior ? { background: `rgba(87, 155, 252, ${(Math.max(p.valor, 0) / maior) * 0.38})` } : undefined}
                    {...clicavel(p && onAbrir ? () => onAbrir({ chave: f.chave, pilha: c.chave, titulo: `${w.titulo}: ${f.rotulo} · ${c.rotulo}` }) : undefined)}>
                    {p ? fmtValor(p.valor, w, r.unidade) : ''}
                  </td>
                );
              })}
              <td className="num total">{fmtValor(f.valor, w, r.unidade)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>Total</th>{cols.map(c => <td key={c.chave} className="num total">{fmtValor(c.valor, w, r.unidade)}</td>)}<td className="num total">{fmtValor(r.valor, w, r.unidade)}</td></tr></tfoot>
      </table>
    </div>
  );
}

function CelulaCor({ c }: { c?: { texto: string; cor?: string; vazia: boolean } }) {
  if (!c || c.vazia) return <span className="pw-celula-vazia">—</span>;
  return c.cor ? <span className="pw-etiqueta" style={{ background: c.cor, color: corTexto(c.cor) }}>{c.texto}</span> : <>{c.texto}</>;
}

function Matriz({ w, r, onItem }: Props) {
  const t = r.tabela;
  if (!t?.colunas.length) return <div className="pw-vazio">Escolha as colunas da matriz.</div>;
  if (!t.linhas.length) return <div className="pw-vazio">{w.soPendentes ? 'Nenhuma pendência: todos os itens têm todas as colunas preenchidas.' : 'Nenhum item para mostrar.'}</div>;
  const preenchidas = (titulo: string) => t.linhas.filter(l => !l.celulas[titulo]?.vazia).length;
  return (
    <div className="pw-tabela-rola">
      <table className="pw-tabela pw-matriz">
        <thead><tr><th>Item</th>{t.colunas.map(c => <th key={c}>{c}<small>{preenchidas(c)} de {t.linhas.length}</small></th>)}</tr></thead>
        <tbody>
          {t.linhas.map(l => (
            <tr key={l.id}>
              <th {...clicavel(onItem && (() => onItem(l.quadroId, l.id)))} title={`${l.quadro} · ${l.grupo}`}>{l.nome}</th>
              {t.colunas.map(c => <td key={c} className={l.celulas[c]?.vazia ? 'vazia' : ''}><CelulaCor c={l.celulas[c]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {t.cortadas > 0 && <p className="muted small">E mais {t.cortadas} {t.cortadas === 1 ? 'item' : 'itens'}: filtre ou aumente o limite.</p>}
    </div>
  );
}

function textoDias(l: LinhaTabela) {
  if (l.dias == null) return 'Sem data';
  if (l.dias < 0) return `${-l.dias} ${l.dias === -1 ? 'dia' : 'dias'} de atraso`;
  if (l.dias === 0) return 'Vence hoje';
  return `Em ${l.dias} ${l.dias === 1 ? 'dia' : 'dias'}`;
}
const classeDias = (d: number | null | undefined) => (d == null ? 'sem' : d < 0 ? 'atrasado' : d <= 7 ? 'perto' : d <= 30 ? 'medio' : 'longe');

function Lista({ w, r, onItem }: Props) {
  const t = r.tabela;
  if (!t?.linhas.length) return <div className="pw-vazio">Nenhum item para mostrar.</div>;
  return (
    <div className="pw-tabela-rola">
      <table className="pw-tabela pw-lista">
        <thead><tr><th>Item</th>{w.dataAlerta && <th>{w.dataAlerta}</th>}{t.colunas.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {t.linhas.map(l => (
            <tr key={l.id}>
              <th {...clicavel(onItem && (() => onItem(l.quadroId, l.id)))} title={`${l.quadro} · ${l.grupo}`}>{l.nome}</th>
              {w.dataAlerta && <td><span className={`pw-dias ${classeDias(l.dias)}`}>{textoDias(l)}</span></td>}
              {t.colunas.map(c => <td key={c}><CelulaCor c={l.celulas[c]} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {t.cortadas > 0 && <p className="muted small">E mais {t.cortadas} {t.cortadas === 1 ? 'item' : 'itens'}: filtre ou aumente o limite.</p>}
    </div>
  );
}

function Carga({ w, r, onAbrir }: Props) {
  const c = r.carga;
  if (!c?.linhas.length) return <div className="pw-vazio">Nenhum item com pessoa e data neste período.</div>;
  return (
    <div className="pw-tabela-rola">
      <table className="pw-tabela pw-carga">
        <thead><tr><th>Pessoa</th>{c.buckets.map(b => <th key={b.chave} className="num">{b.rotulo}</th>)}</tr></thead>
        <tbody>
          {c.linhas.map(l => (
            <tr key={l.chave}>
              <th>{l.rotulo}</th>
              {l.celulas.map((v, i) => {
                const b = c.buckets[i];
                const acima = !!w.capacidade && v > w.capacidade;
                return (
                  <td key={b.chave} className={`num${acima ? ' acima' : ''}`} style={!acima && v && c.max ? { background: `rgba(87, 155, 252, ${(v / c.max) * 0.45})` } : undefined}
                    title={`${l.rotulo}, ${b.rotulo}: ${fmtValor(v, w, r.unidade)}${acima ? ` (acima de ${w.capacidade})` : ''}`}
                    {...clicavel(v && onAbrir ? () => onAbrir({ chave: l.chave, bucket: { de: b.de, ate: b.ate }, titulo: `${w.titulo}: ${l.rotulo}, ${b.rotulo}` }) : undefined)}>
                    {v ? fmtValor(v, w, r.unidade) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
