import { useEffect, useMemo, useRef, useState } from 'react';
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
export function Calendario({ itens, colunas, grupos, acoes, usuarios, abrirItem, coluna }: Base & { coluna: Coluna }) {
  const hoje = hojeISO();
  const [mes, setMes] = useState(hoje.slice(0, 7));
  const [arrastando, setArrastando] = useState<number | null>(null);
  const primeiro = `${mes}-01`;
  const inicio = inicioDaSemana(primeiro);
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicio, i));
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
  const navegar = (n: number) => { const d = new Date(a, m - 1 + n, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  return (
    <div className="calendario">
      <div className="cal-barra">
        <button className="fr-btn" onClick={() => setMes(hoje.slice(0, 7))}>Hoje</button>
        <button className="btn-icone" onClick={() => navegar(-1)} aria-label="Mês anterior"><ChevronLeft size={18} /></button>
        <button className="btn-icone" onClick={() => navegar(1)} aria-label="Próximo mês"><ChevronRight size={18} /></button>
        <h3>{new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3>
      </div>
      <div className="cal-grade">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map(d => <div key={d} className="cal-dia-semana">{d}</div>)}
        {dias.map(dia => (
          <div key={dia} className={`cal-dia${dia.slice(0, 7) !== mes ? ' fora' : ''}${dia === hoje ? ' hoje' : ''}`}
            onDragOver={e => e.preventDefault()} onDrop={() => mover(dia)}
            onDoubleClick={() => { const g = grupos[0]; if (g) acoes.criarItem(g.id, 'Novo item', false, { [coluna.id]: coluna.tipo === 'periodo' ? { inicio: dia, fim: dia } : dia }); }}>
            <span className="cal-num">{Number(dia.slice(8))}</span>
            {noDia(dia).slice(0, 4).map(i => (
              <button key={i.id} className="cal-item" draggable onDragStart={() => setArrastando(i.id)} onClick={() => abrirItem(i.id)}
                style={{ borderLeftColor: corGrupo.get(i.grupo_id) }} title={i.nome}>{i.nome}</button>
            ))}
            {noDia(dia).length > 4 && <small className="muted">+{noDia(dia).length - 4}</small>}
          </div>
        ))}
      </div>
      <p className="muted fr-small dica">Arraste para mudar a data · clique duas vezes num dia para criar um item.</p>
    </div>
  );
}

// ---------------------------------------------------------------- Cronograma / Gantt (por coluna de período)
const DIA = 26;
export function Cronograma({ itens, todasColunas, grupos, acoes, abrirItem, coluna }: Base & { coluna: Coluna }) {
  const hoje = hojeISO();
  const caixa = useRef<HTMLDivElement>(null);
  const comData = itens.filter(i => i.valores[coluna.id]?.inicio);
  const ini = somarDias(inicioDaSemana([hoje, ...comData.map(i => i.valores[coluna.id].inicio as string)].sort()[0]), -7);
  const fimMax = [hoje, ...comData.map(i => (i.valores[coluna.id].fim ?? i.valores[coluna.id].inicio) as string)].sort().at(-1)!;
  const dias = diasEntre(ini, fimMax) + 21;
  const xHoje = diasEntre(ini, hoje) * DIA;
  useEffect(() => { if (caixa.current) caixa.current.scrollLeft = Math.max(0, xHoje - 200); }, [xHoje]);
  const semanas = useMemo(() => Array.from({ length: Math.ceil(dias / 7) }, (_, k) => somarDias(ini, k * 7)), [ini, dias]);

  // Arrastar a barra move o período inteiro (em dias).
  const arrastarBarra = (it: Item, x0: number) => {
    const v = it.valores[coluna.id];
    let delta = 0;
    const el = document.querySelector<HTMLElement>(`[data-barra="${it.id}"]`);
    const mover = (e: MouseEvent) => { delta = Math.round((e.clientX - x0) / DIA); if (el) el.style.transform = `translateX(${delta * DIA}px)`; };
    const soltar = () => {
      document.removeEventListener('mousemove', mover);
      document.removeEventListener('mouseup', soltar);
      if (el) el.style.transform = '';
      if (delta) acoes.definirValor(it.id, coluna.id, { inicio: somarDias(v.inicio, delta), fim: somarDias(v.fim ?? v.inicio, delta) });
      else abrirItem(it.id);
    };
    document.addEventListener('mousemove', mover);
    document.addEventListener('mouseup', soltar);
  };

  return (
    <div className="gantt" ref={caixa}>
      <div className="gt-cab" style={{ width: 260 + dias * DIA }}>
        <div className="gt-fixo">Itens</div>
        <div className="gt-escala" style={{ width: dias * DIA }}>
          {semanas.map(s => <span key={s} style={{ left: diasEntre(ini, s) * DIA }}>{fmtData(s)}</span>)}
        </div>
      </div>
      {grupos.map(g => {
        const lista = itens.filter(i => i.grupo_id === g.id);
        if (!lista.length) return null;
        return (
          <div key={g.id} className="gt-grupo">
            <div className="gt-grupo-nome" style={{ color: g.cor, width: 260 + dias * DIA }}><span className="gt-fixo">{g.nome}</span></div>
            {lista.map(i => {
              const v = i.valores[coluna.id];
              const x = v?.inicio ? diasEntre(ini, v.inicio) * DIA : 0;
              const w = v?.inicio ? (diasEntre(v.inicio, v.fim ?? v.inicio) + 1) * DIA : 0;
              const feito = itemConcluido(i, todasColunas);
              return (
                <div key={i.id} className="gt-linha" style={{ width: 260 + dias * DIA }}>
                  <button className="gt-fixo gt-nome" onClick={() => abrirItem(i.id)} title={i.nome}>{i.nome}</button>
                  <div className="gt-trilho" style={{ width: dias * DIA }}>
                    <div className="gt-hoje" style={{ left: xHoje + DIA / 2 }} />
                    {w > 0 && (
                      <div className={`gt-barra${feito ? ' feito' : ''}`} data-barra={i.id} style={{ left: x, width: w, background: g.cor, color: corTexto(g.cor) }}
                        title={`${i.nome}: ${fmtData(v.inicio)} – ${fmtData(v.fim)}${feito ? ' (concluído)' : ''}`} onMouseDown={e => { e.preventDefault(); arrastarBarra(i, e.clientX); }}>
                        {feito && <Check size={13} />}{w > 70 ? i.nome : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
      {comData.length === 0 && <p className="muted vazio-visao">Nenhum item tem “{coluna.titulo}” preenchido.</p>}
    </div>
  );
}
