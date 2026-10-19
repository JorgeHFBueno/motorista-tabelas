import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from '../rotas.tsx';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { req, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { corTexto, diasEntre, fmtData, hojeISO, inicioDaSemana, somarDias } from '../util.ts';

// O servidor marca "concluido" pelo rótulo do status principal (rótulos de concluído de cada coluna).
export const concluido = (i: Row) => !!i.concluido;

export function useMeuTrabalho() {
  const nav = useNav();
  const [itens, setItens] = useState<Row[] | null>(null);
  useEffect(() => { if (nav.usuario) req<Row[]>('GET', `meu-trabalho?usuario_id=${nav.usuario.id}`).then(setItens); }, [nav.usuario]);
  return itens;
}

export function agrupar(itens: Row[]) {
  const hoje = hojeISO();
  const fimSemana = somarDias(inicioDaSemana(hoje), 6);
  const fimProxima = somarDias(fimSemana, 7);
  const grupos: { nome: string; cor: string; itens: Row[] }[] = [
    { nome: 'Atrasados', cor: '#e2445c', itens: [] }, { nome: 'Hoje', cor: '#00a36c', itens: [] },
    { nome: 'Esta semana', cor: '#579bfc', itens: [] }, { nome: 'Próxima semana', cor: '#a25ddc', itens: [] },
    { nome: 'Mais tarde', cor: '#fdab3d', itens: [] }, { nome: 'Sem data', cor: '#808080', itens: [] },
  ];
  for (const i of [...itens].sort((a, b) => String(a.data ?? '9').localeCompare(String(b.data ?? '9')))) {
    const d = i.data as string | null;
    const k = !d ? 5 : d < hoje ? 0 : d === hoje ? 1 : d <= fimSemana ? 2 : d <= fimProxima ? 3 : 4;
    grupos[k].itens.push(i);
  }
  return grupos;
}

export default function MeuTrabalho() {
  const navigate = useNavigate();
  const itens = useMeuTrabalho();
  const [mostrarFeitos, setMostrarFeitos] = useState(false);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const grupos = useMemo(() => agrupar((itens ?? []).filter(i => mostrarFeitos || !concluido(i))), [itens, mostrarFeitos]);
  const hoje = hojeISO();
  return (
    <div className="pagina">
      <header className="pagina-cab">
        <div><h1>Meu trabalho</h1><p className="muted">Tudo em que você aparece como responsável, de todos os quadros.</p></div>
        <label className="check-form"><input type="checkbox" className="caixa" checked={mostrarFeitos} onChange={e => setMostrarFeitos(e.target.checked)} /> Mostrar concluídos</label>
      </header>
      {!itens ? <p className="muted">Carregando…</p> : grupos.map(g => (
        <section key={g.nome} className="mt-grupo">
          <button className="mt-grupo-cab" style={{ color: g.cor }} onClick={() => setFechados(s => { const n = new Set(s); if (n.has(g.nome)) n.delete(g.nome); else n.add(g.nome); return n; })}>
            {fechados.has(g.nome) ? <ChevronRight size={18} /> : <ChevronDown size={18} />}{g.nome}<small className="muted">{g.itens.length} itens</small>
          </button>
          {!fechados.has(g.nome) && (
            <div className="mt-tabela" style={{ ['--cor-grupo' as string]: g.cor }}>
              <div className="mt-linha mt-cab"><span>Item</span><span>Quadro</span><span>Status</span><span>Data</span></div>
              {g.itens.map(i => (
                <div key={i.id} className="mt-linha" onClick={() => navigate(`/quadros/${i.quadro_id}?item=${i.abrir_item_id ?? i.id}`)}>
                  <span className="mt-nome">{i.nome}</span>
                  <span className="mt-quadro"><span className="bolinha" style={{ background: i.grupo_cor }} />{i.quadro_nome} · {i.grupo_nome}</span>
                  <span>{i.status?.texto ? <span className="mt-status" style={{ background: i.status.cor, color: corTexto(i.status.cor) }}>{i.status.texto}</span> : null}</span>
                  <span className={i.data && i.data < hoje && !concluido(i) ? 'texto-alerta' : ''}>
                    {i.data ? `${fmtData(i.data)}${i.data < hoje && !concluido(i) ? ` · ${diasEntre(i.data, hoje)} d atrasado` : ''}` : '—'}
                  </span>
                </div>
              ))}
              {!g.itens.length && <div className="mt-vazio">Nada aqui.</div>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
