// Coluna "Controle de tempo": botão de iniciar/parar, total que corre ao vivo e o registro das sessões
// (lançar à mão, corrigir, apagar e exportar para o Excel). A gravação é a rota itens/:id/tempo do api.ts.
import { useEffect, useState, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight, Download, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { Pessoa } from '../api.ts';
import { Avatar, Popover, usePopover } from '../ui/base.tsx';
import { hojeISO, inicioDaSemana, somarDias } from '../util.ts';
import type { Coluna, Item } from './tipos.ts';
import {
  diaLocal, duracaoSessao, fmtDuracao, fmtRelogio, horaLocal, paraISO, sessaoAberta, sessoesDe, totalSegundos,
  type OpTempo, type Sessao,
} from './tempo.ts';

type Props = {
  coluna: Coluna;
  valor: unknown;
  usuarios: Pessoa[];
  item?: Item;
  onTempo?: (op: OpTempo) => Promise<void>;
};

// Relógio da tela: atualiza a cada segundo só enquanto o cronômetro está ligado.
function useAgora(ligado: boolean) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    setAgora(Date.now());
    if (!ligado) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ligado]);
  return agora;
}

// Erro de gravação: o quadro só para ver já mostrou o aviso; o resto vira alerta.
const avisarErro = (e: unknown) => { if ((e as Error).message !== 'somente leitura') alert((e as Error).message); };

export function CelulaTempo({ coluna, valor, usuarios, item, onTempo }: Props) {
  const pop = usePopover<HTMLDivElement>();
  const aberta = sessaoAberta(valor);
  const agora = useAgora(!!aberta);
  const [ocupado, setOcupado] = useState(false);
  const total = totalSegundos(valor, agora);

  // Manda o que a pessoa está vendo (iniciar ou parar), e não "alternar": se outra pessoa já ligou, não desliga por engano.
  const ligarDesligar = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!onTempo || ocupado) return;
    setOcupado(true);
    try { await onTempo({ acao: aberta ? 'parar' : 'iniciar' }); } catch (err) { avisarErro(err); } finally { setOcupado(false); }
  };

  return (
    <>
      <div ref={pop.ref} className={`cel cel-tempo${aberta ? ' ligado' : ''}`} onClick={pop.alternar} title="Abrir o registro de tempo">
        <button className="tempo-botao" onClick={ligarDesligar} disabled={!onTempo || ocupado}
          title={aberta ? 'Parar o cronômetro' : 'Iniciar o cronômetro'} aria-label={aberta ? 'Parar o cronômetro' : 'Iniciar o cronômetro'}>
          {aberta ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
        </button>
        <span className="tempo-total">{fmtDuracao(total, !!aberta)}</span>
      </div>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="centro" largura={380}>
          <RegistroTempo coluna={coluna} valor={valor} usuarios={usuarios} item={item} onTempo={onTempo} agora={agora} />
        </Popover>
      )}
    </>
  );
}

// ---------------------------------------------------------------- registro (lista de sessões)
function RegistroTempo({ coluna, valor, usuarios, item, onTempo, agora }: Props & { agora: number }) {
  const [form, setForm] = useState<{ sessao?: Sessao } | null>(null);
  const sessoes = [...sessoesDe(valor)].sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio));
  const usuario = (id: unknown) => usuarios.find(u => u.id === String(id));
  const podeEditar = !!onTempo;

  if (form) return <FormSessao sessao={form.sessao} onVoltar={() => setForm(null)} onSalvar={async (inicio, fim) => {
    await onTempo!(form.sessao ? { acao: 'editar', sessao_id: form.sessao.id, inicio, fim } : { acao: 'adicionar', inicio, fim });
    setForm(null);
  }} />;

  const excluir = async (s: Sessao) => {
    if (!confirm(`Apagar a sessão de ${fmtDuracao(duracaoSessao(s))} (${new Date(s.inicio).toLocaleDateString('pt-BR')})?`)) return;
    try { await onTempo!({ acao: 'excluir', sessao_id: s.id }); } catch (e) { avisarErro(e); }
  };
  const exportar = async () => {
    const { exportarSessoesTempo } = await import('./excel.ts');
    await exportarSessoesTempo({ arquivo: `${item?.nome ?? 'Item'} - ${coluna.titulo}`, linhas: sessoes.map(s => ({ item: item?.nome ?? '', sessao: s })), nomeUsuario: id => String(usuario(id)?.nome ?? '') });
  };

  return (
    <div className="registro-tempo">
      <div className="registro-tempo-topo">
        <strong>Registro de tempo</strong>
        <button className="fr-btn-link" onClick={exportar} disabled={!sessoes.length}><Download size={14} /> Exportar para Excel</button>
      </div>
      {!sessoes.length ? (
        <div className="registro-tempo-vazio">
          {podeEditar ? <button className="fr-btn btn-primario" onClick={() => setForm({})}><Plus size={15} /> Adicionar sessão manualmente</button>
            : <span className="muted">Nenhuma sessão registrada.</span>}
        </div>
      ) : (
        <>
          <div className="registro-tempo-resumo muted">
            Total <strong>{fmtDuracao(totalSegundos(valor, agora), !!sessaoAberta(valor))}</strong> em {sessoes.length} {sessoes.length === 1 ? 'sessão' : 'sessões'}
          </div>
          <ul className="registro-tempo-lista">
            {sessoes.map(s => {
              const u = usuario(s.por);
              const mesmoDia = !s.fim || diaLocal(s.inicio) === diaLocal(s.fim);
              return (
                <li key={s.id} className={s.fim ? '' : 'ligada'}>
                  {u ? <Avatar nome={String(u.nome)} cor={u.cor} tamanho={24} titulo={`Iniciada por ${u.nome}`} /> : <span className="avatar avatar-vazio" title="Pessoa não identificada">?</span>}
                  <div className="registro-tempo-quando">
                    <span>{new Date(s.inicio).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                    <small className="muted">
                      {horaLocal(s.inicio)} – {s.fim ? `${horaLocal(s.fim)}${mesmoDia ? '' : ` (${new Date(s.fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })})`}` : 'agora'}
                      {s.manual && <span className="registro-tempo-tag" title="Lançada ou corrigida à mão">manual</span>}
                    </small>
                  </div>
                  <span className="registro-tempo-dur">{s.fim ? fmtDuracao(duracaoSessao(s)) : <><span className="ponto-ligado" />{fmtDuracao(duracaoSessao(s, agora), true)}</>}</span>
                  {podeEditar && (
                    <span className="registro-tempo-acoes">
                      {s.fim && <button className="btn-icone" title="Corrigir" onClick={() => setForm({ sessao: s })}><Pencil size={14} /></button>}
                      <button className="btn-icone" title="Apagar" onClick={() => excluir(s)}><Trash2 size={14} /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {podeEditar && <button className="fr-btn registro-tempo-add" onClick={() => setForm({})}><Plus size={15} /> Adicionar sessão manualmente</button>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lançar ou corrigir uma sessão
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function FormSessao({ sessao, onVoltar, onSalvar }: { sessao?: Sessao; onVoltar: () => void; onSalvar: (inicio: string, fim: string) => Promise<void> }) {
  const hoje = hojeISO();
  // Nova sessão: a última hora, como no monday (ex.: 12:25 – 13:25).
  const [dia, setDia] = useState(() => (sessao ? diaLocal(sessao.inicio) : hoje));
  const [ini, setIni] = useState(() => (sessao ? horaLocal(sessao.inicio) : hhmm(new Date(Date.now() - 3600_000))));
  const [fim, setFim] = useState(() => (sessao?.fim ? horaLocal(sessao.fim) : hhmm(new Date())));
  const [semana, setSemana] = useState(() => inicioDaSemana(sessao ? diaLocal(sessao.inicio) : hoje));
  const [calendario, setCalendario] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Fim antes do início = termina no dia seguinte (turno que passa da meia-noite).
  const viraDia = !!ini && !!fim && fim <= ini;
  const inicioISO = dia && ini ? paraISO(dia, ini) : null;
  const fimISO = dia && fim ? paraISO(viraDia ? somarDias(dia, 1) : dia, fim) : null;
  const seg = inicioISO && fimISO ? Math.max(0, Math.round((Date.parse(fimISO) - Date.parse(inicioISO)) / 1000)) : 0;
  const noFuturo = !!fimISO && Date.parse(fimISO) > Date.now() + 60_000;
  const problema = !inicioISO || !fimISO ? 'Preencha o dia, o início e o fim.' : noFuturo ? 'A sessão não pode terminar no futuro.' : null;

  const salvar = async () => {
    if (problema || !inicioISO || !fimISO) return;
    setSalvando(true);
    setErro(null);
    try { await onSalvar(inicioISO, fimISO); } catch (e) { if ((e as Error).message !== 'somente leitura') setErro((e as Error).message); } finally { setSalvando(false); }
  };
  const mesAno = new Date(`${semana}T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^./, l => l.toUpperCase());

  return (
    <div className="registro-tempo">
      <div className="registro-tempo-topo">
        <strong>{sessao ? 'Corrigir sessão' : 'Adicionar sessão'}</strong>
        <button className="fr-btn-link" onClick={onVoltar}>Voltar</button>
      </div>
      <div className="tempo-semana-topo">
        <button className="btn-icone" onClick={() => setSemana(somarDias(semana, -7))} title="Semana anterior"><ChevronLeft size={16} /></button>
        <span>{mesAno}</span>
        <button className="btn-icone" onClick={() => setSemana(somarDias(semana, 7))} disabled={somarDias(semana, 7) > hoje} title="Próxima semana"><ChevronRight size={16} /></button>
      </div>
      <div className="tempo-semana">
        {DIAS.map((nome, k) => {
          const d = somarDias(semana, k);
          return (
            <button key={d} className={`tempo-dia${d === dia ? ' ativo' : ''}${d === hoje ? ' hoje' : ''}`} disabled={d > hoje} onClick={() => setDia(d)}>
              <small>{nome}</small><span>{Number(d.slice(8))}</span>
            </button>
          );
        })}
      </div>
      <div className="tempo-calendario">
        {calendario
          ? <input type="date" value={dia} max={hoje} onChange={e => { if (e.target.value) { setDia(e.target.value); setSemana(inicioDaSemana(e.target.value)); } }} />
          : <button className="fr-btn-link" onClick={() => setCalendario(true)}>Mostrar calendário completo</button>}
      </div>
      <div className="tempo-horas">
        <label>Início<input type="time" value={ini} onChange={e => setIni(e.target.value)} /></label>
        <label>Fim<input type="time" value={fim} onChange={e => setFim(e.target.value)} /></label>
      </div>
      <div className="tempo-rodape">
        <span className="tempo-duracao">{fmtRelogio(seg)}{viraDia && <small className="muted"> (termina no dia seguinte)</small>}</span>
        <button className="fr-btn btn-primario" onClick={salvar} disabled={!!problema || salvando}>{sessao ? 'Salvar' : 'Adicionar sessão'}</button>
      </div>
      {(erro || (problema && inicioISO && fimISO)) && <div className="tempo-erro">{erro ?? problema}</div>}
    </div>
  );
}
