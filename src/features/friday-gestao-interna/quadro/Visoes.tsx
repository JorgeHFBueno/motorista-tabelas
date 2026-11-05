import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, MessageCircle, Plus } from 'lucide-react';
import type { Pessoa } from '../api.ts';
import { Avatar } from '../ui/base.tsx';
import { corTexto, diasEntre, fmtData, hojeISO, inicioDaSemana, somarDias } from '../util.ts';
import { itemConcluido, rotuloDe, type Coluna, type Grupo, type Item, type Rotulo } from './tipos.ts';
import type { Acoes } from './useQuadro.ts';

type Base = { itens: Item[]; colunas: Coluna[]; todasColunas: Coluna[]; grupos: Grupo[]; acoes: Acoes; usuarios: Pessoa[]; abrirItem: (id: number) => void };

// Cartão de item usado no Kanban e no calendário.
function Cartao({ item, colunas, usuarios, ocultar, abrirItem, onDragStart }: { item: Item; colunas: Coluna[]; usuarios: Pessoa[]; ocultar?: number; abrirItem: (id: number) => void; onDragStart?: () => void }) {
  const pessoas = colunas.filter(c => c.tipo === 'pessoa').flatMap(c => (item.valores[c.id] ?? []) as string[]);
  const extras = colunas.filter(c => c.id !== ocultar && ['status', 'data', 'periodo'].includes(c.tipo) && item.valores[c.id] != null).slice(0, 3);
  return (
    <div className="cartao" draggable={!!onDragStart} onDragStart={onDragStart} onClick={() => abrirItem(item.id)}>
      <div className="cartao-nome">{item.nome}</div>
      {extras.map(c => {
        const v = item.valores[c.id];
        if (c.tipo === 'status') { const r = rotuloDe(c, v); return r?.texto ? <span key={c.id} className="cartao-status" style={{ background: r.cor, color: corTexto(r.cor) }}>{r.texto}</span> : null; }
        if (c.tipo === 'data') return <span key={c.id} className="cartao-meta">{c.titulo}: {fmtData(v)}</span>;
        return <span key={c.id} className="cartao-meta">{fmtData(v.inicio)} – {fmtData(v.fim)}</span>;
      })}
      <div className="cartao-rodape">
        <span className="avatares">{[...new Set(pessoas)].slice(0, 3).map(id => { const u = usuarios.find(x => x.id === id); return u ? <Avatar key={id} nome={u.nome} cor={u.cor} tamanho={22} /> : null; })}</span>
        {item.n_atualizacoes ? <span className="cartao-bolha"><MessageCircle size={13} /> {item.n_atualizacoes}</span> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Kanban (por uma coluna de status)
export function Kanban({ itens, colunas, grupos, acoes, usuarios, abrirItem, coluna }: Base & { coluna: Coluna }) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const rotulos = [...((coluna.config.rotulos ?? []) as Rotulo[]).filter(r => r.id !== '0'), ...((coluna.config.rotulos ?? []) as Rotulo[]).filter(r => r.id === '0')];
  return (
    <div className="kanban">
      {rotulos.map(r => {
        const lista = itens.filter(i => String(i.valores[coluna.id] ?? '0') === r.id);
        return (
          <div key={r.id} className="kb-coluna" onDragOver={e => e.preventDefault()}
            onDrop={() => { if (arrastando != null) acoes.definirValor(arrastando, coluna.id, r.id === '0' ? null : r.id); setArrastando(null); }}>
            <header style={{ background: r.cor, color: corTexto(r.cor) }}><span>{r.texto || 'Sem rótulo'}</span><small>{lista.length}</small></header>
            <div className="kb-cartoes">
              {lista.map(i => <Cartao key={i.id} item={i} colunas={colunas} usuarios={usuarios} ocultar={coluna.id} abrirItem={abrirItem} onDragStart={() => setArrastando(i.id)} />)}
              <button className="kb-novo" onClick={async () => { const g = grupos[0]; if (g) await acoes.criarItem(g.id, 'Novo item', true, r.id === '0' ? {} : { [coluna.id]: r.id }); }}>
                <Plus size={14} /> Novo item
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Calendário mensal (por data ou período)
export function Calendario({ itens, colunas, grupos, acoes, usuarios, abrirItem, coluna, modo = 'mes', onModo }: Base & { coluna: Coluna; modo?: 'mes' | 'semana'; onModo?: (m: 'mes' | 'semana') => void }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [semana, setSemana] = useState(inicioDaSemana(hoje));
  const [arrastando, setArrastando] = useState<number | null>(null);
  const primeiro = `${mes}-01`;
  const inicio = modo === 'semana' ? semana : inicioDaSemana(primeiro);
  const dias = Array.from({ length: modo === 'semana' ? 7 : 42 }, (_, i) => somarDias(inicio, i));
  const corGrupo = new Map(grupos.map(g => [g.id, g.cor]));
  const noDia = (dia: string) => itens.filter(i => {
    const v = i.valores[coluna.id];
    if (!v) return false;
    return coluna.tipo === 'periodo' ? (v.inicio ?? v.fim) <= dia && dia <= (v.fim ?? v.inicio) : v === dia;
  });
  const mover = (dia: string) => {
    const it = itens.find(i => i.id === arrastando);
    setArrastando(null);
    if (!it) return;
    const v = it.valores[coluna.id];
    if (coluna.tipo === 'periodo' && v?.inicio) {
      const dur = v.fim ? diasEntre(v.inicio, v.fim) : 0;
      acoes.definirValor(it.id, coluna.id, { inicio: dia, fim: somarDias(dia, dur) });
    } else acoes.definirValor(it.id, coluna.id, dia);
  };
  const [a, m] = mes.split('-').map(Number);
  const navegar = (n: number) => {
    if (modo === 'semana') { setSemana(somarDias(semana, n * 7)); return; }
    const d = new Date(a, m - 1 + n, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const irHoje = () => { setMes(hoje.slice(0, 7)); setSemana(inicioDaSemana(hoje)); };
  return (
    <div className="calendario">
      <div className="cal-barra">
        <button className="fr-btn" onClick={irHoje}>Hoje</button>
        <button className="btn-icone" onClick={() => navegar(-1)} aria-label={modo === 'semana' ? 'Semana anterior' : 'Mês anterior'}><ChevronLeft size={18} /></button>
        <button className="btn-icone" onClick={() => navegar(1)} aria-label={modo === 'semana' ? 'Próxima semana' : 'Próximo mês'}><ChevronRight size={18} /></button>
        <h3>{modo === 'semana' ? `${fmtData(semana)} a ${fmtData(somarDias(semana, 6))}` : new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
        {onModo && (
          <div className="cal-modo">
            <button className={`chip-sub${modo === 'mes' ? ' on' : ''}`} onClick={() => onModo('mes')}>Mês</button>
            <button className={`chip-sub${modo === 'semana' ? ' on' : ''}`} onClick={() => { setSemana(inicioDaSemana(mes === hoje.slice(0, 7) ? hoje : primeiro)); onModo('semana'); }}>Semana</button>
          </div>
        )}
      </div>
      <div className={`cal-grade${modo === 'semana' ? ' semana' : ''}`}>
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => <div key={d} className="cal-dia-semana">{d}</div>)}
        {dias.map(dia => (
          <div key={dia} className={`cal-dia${modo === 'mes' && dia.slice(0, 7) !== mes ? ' fora' : ''}${dia === hoje ? ' hoje' : ''}`}
            onDragOver={e => e.preventDefault()} onDrop={() => mover(dia)}
            onDoubleClick={() => { const g = grupos[0]; if (g) acoes.criarItem(g.id, 'Novo item', false, { [coluna.id]: coluna.tipo === 'periodo' ? { inicio: dia, fim: dia } : dia }); }}>
            <span className="cal-num">{Number(dia.slice(8))}</span>
            {noDia(dia).slice(0, modo === 'semana' ? undefined : 4).map(i => (
              <button key={i.id} className="cal-item" draggable onDragStart={() => setArrastando(i.id)} onClick={() => abrirItem(i.id)}
                style={{ borderLeftColor: corGrupo.get(i.grupo_id) }} title={i.nome}>{i.nome}</button>
            ))}
            {modo === 'mes' && noDia(dia).length > 4 && <small className="muted">+{noDia(dia).length - 4}</small>}
          </div>
        ))}
      </div>
      <p className="muted fr-small dica">Arraste para mudar a data · clique duas vezes num dia para criar um item.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Cronograma / Gantt (por coluna de período ou data)
const DIA = 26;
// Coluna de data vira uma barra de um dia. Arrastar sempre mantém o tipo do valor.
function intervaloDe(c: Coluna, v: any): { inicio: string; fim: string } | null {
  if (!v) return null;
  if (c.tipo === 'data') return { inicio: String(v).slice(0, 10), fim: String(v).slice(0, 10) };
  const inicio = v.inicio ?? v.fim;
  return inicio ? { inicio, fim: v.fim ?? v.inicio } : null;
}

type Barra = { item: Item; coluna: Coluna; nome: string; tipo: 'principal' | 'extra' | 'sub' };

export function Cronograma({ itens, todasColunas, grupos, acoes, abrirItem, coluna, extras = [], sub }: Base & { coluna: Coluna; extras?: Coluna[]; sub?: { itens: Item[]; coluna: Coluna; colunas: Coluna[] } | null }) {
  const hoje = hojeISO();
  const caixa = useRef<HTMLDivElement>(null);
  const visiveis = new Set(itens.map(i => i.id));
  const subs = (sub?.itens ?? []).filter(s => s.item_pai_id != null && visiveis.has(s.item_pai_id));
  const todas = [...itens.flatMap(i => [coluna, ...extras].map(c => intervaloDe(c, i.valores[c.id]))), ...subs.map(s => (sub ? intervaloDe(sub.coluna, s.valores[sub.coluna.id]) : null))].filter((x): x is { inicio: string; fim: string } => !!x);
  const ini = somarDias(inicioDaSemana([hoje, ...todas.map(x => x.inicio)].sort()[0]), -7);
  const fimMax = [hoje, ...todas.map(x => x.fim)].sort().at(-1)!;
  const dias = diasEntre(ini, fimMax) + 21;
  const xHoje = diasEntre(ini, hoje) * DIA;
  useEffect(() => { if (caixa.current) caixa.current.scrollLeft = Math.max(0, xHoje - 200); }, [xHoje]);
  const semanas = useMemo(() => Array.from({ length: Math.ceil(dias / 7) }, (_, k) => somarDias(ini, k * 7)), [ini, dias]);

  // Arrastar a barra move o período inteiro (em dias).
  const arrastarBarra = (b: Barra, x0: number) => {
    const v = intervaloDe(b.coluna, b.item.valores[b.coluna.id]);
    if (!v) return;
    let delta = 0;
    const el = document.querySelector<HTMLElement>(`[data-barra="${b.item.id}-${b.coluna.id}"]`);
    const mover = (e: MouseEvent) => { delta = Math.round((e.clientX - x0) / DIA); if (el) el.style.transform = `translateX(${delta * DIA}px)`; };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      if (el) el.style.transform = '';
      if (delta) acoes.definirValor(b.item.id, b.coluna.id, b.coluna.tipo === 'data' ? somarDias(v.inicio, delta) : { inicio: somarDias(v.inicio, delta), fim: somarDias(v.fim, delta) });
      else abrirItem(b.item.id);
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };

  const linha = (b: Barra, cor: string) => {
    const v = intervaloDe(b.coluna, b.item.valores[b.coluna.id]);
    const x = v ? diasEntre(ini, v.inicio) * DIA : 0;
    const w = v ? (diasEntre(v.inicio, v.fim) + 1) * DIA : 0;
    const feito = itemConcluido(b.item, b.tipo === 'sub' && sub ? sub.colunas : todasColunas);
    const classe = b.tipo === 'principal' ? '' : b.tipo === 'sub' ? ' gt-sub' : ' gt-extra';
    return (
      <div key={`${b.item.id}-${b.coluna.id}`} className={`gt-linha${classe}`} style={{ width: 260 + dias * DIA }}>
        <button className="gt-fixo gt-nome" onClick={() => abrirItem(b.item.id)} title={b.nome}>{b.nome}</button>
        <div className="gt-trilho" style={{ width: dias * DIA }}>
          <div className="gt-hoje" style={{ left: xHoje + DIA / 2 }} />
          {w > 0 && v && (
            <div className={`gt-barra${feito ? ' feito' : ''}`} data-barra={`${b.item.id}-${b.coluna.id}`} style={{ left: x, width: w, background: cor, color: corTexto(cor) }}
              title={`${b.nome}: ${fmtData(v.inicio)} – ${fmtData(v.fim)}${feito ? ' (concluído)' : ''}`} onMouseDown={e => { e.preventDefault(); arrastarBarra(b, e.clientX); }}>
              {feito && <Check size={13} />}{w > 70 ? b.nome : ''}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="gantt" ref={caixa}>
      <div className="gt-cab" style={{ width: 260 + dias * DIA }}>
        <div className="gt-fixo">Itens</div>
        <div className="gt-escala" style={{ width: dias * DIA }}>
          {semanas.map(k => <span key={k} style={{ left: diasEntre(ini, k) * DIA }}>{fmtData(k)}</span>)}
        </div>
      </div>
      {grupos.map(g => {
        const lista = itens.filter(i => i.grupo_id === g.id);
        if (!lista.length) return null;
        return (
          <div key={g.id} className="gt-grupo">
            <div className="gt-grupo-nome" style={{ color: g.cor, width: 260 + dias * DIA }}><span className="gt-fixo">{g.nome}</span></div>
            {lista.map(i => (
              <Fragment key={i.id}>
                {linha({ item: i, coluna, nome: i.nome, tipo: 'principal' }, g.cor)}
                {extras.filter(c => intervaloDe(c, i.valores[c.id])).map(c => linha({ item: i, coluna: c, nome: c.titulo, tipo: 'extra' }, g.cor))}
                {sub && subs.filter(s => s.item_pai_id === i.id && intervaloDe(sub.coluna, s.valores[sub.coluna.id])).map(s => linha({ item: s, coluna: sub.coluna, nome: s.nome, tipo: 'sub' }, g.cor))}
              </Fragment>
            ))}
          </div>
        );
      })}
      {todas.length === 0 && <p className="muted vazio-visao">Nenhum item tem “{coluna.titulo}” preenchido.</p>}
    </div>
  );
}
