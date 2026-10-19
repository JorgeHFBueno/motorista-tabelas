import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '../rotas.tsx';
import { AtSign, Bell, CheckCheck, Reply, UserPlus, Zap } from 'lucide-react';
import { api, req, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Popover, usePopover } from '../ui/base.tsx';
import { tempoRelativo } from '../quadro/Atualizacoes.tsx';

const ICONE = { mencao: AtSign, resposta: Reply, atribuicao: UserPlus, automacao: Zap } as Record<string, typeof AtSign>;

// Sino da barra superior: menções (@), respostas e atribuições. Atualiza a cada 30 s.
export function Avisos() {
  const nav = useNav();
  const navigate = useNavigate();
  const pop = usePopover<HTMLButtonElement>();
  const [lista, setLista] = useState<Row[]>([]);
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  const carregar = useCallback(() => {
    if (nav.usuario) req<Row[]>('GET', `notificacoes/minhas?usuario_id=${nav.usuario.id}`).then(setLista).catch(() => { /* servidor indisponível: tenta de novo depois */ });
  }, [nav.usuario]);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [carregar]);
  useEffect(() => { if (pop.aberto) carregar(); }, [pop.aberto, carregar]);

  const naoLidas = lista.filter(n => !n.lida).length;
  const abrir = async (n: Row) => {
    pop.fechar();
    if (!n.lida) { setLista(l => l.map(x => (x.id === n.id ? { ...x, lida: 1 } : x))); api.update('notificacoes', n.id, { lida: 1 }); }
    if (n.quadro_id) navigate(`/quadros/${n.quadro_id}?item=${n.item_id}&aba=atualizacoes`);
  };
  const visiveis = soNaoLidas ? lista.filter(n => !n.lida) : lista;

  return (
    <>
      <button ref={pop.ref} className="btn-icone topo-ic sino" aria-label={`Avisos${naoLidas ? `: ${naoLidas} não lidos` : ''}`} title="Avisos" onClick={pop.alternar}>
        <Bell size={19} />{naoLidas > 0 && <span className="sino-n">{naoLidas > 9 ? '9+' : naoLidas}</span>}
      </button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={420}>
          <div className="avisos-cab">
            <strong>Avisos</strong>
            <label className="check-form"><input type="checkbox" className="caixa" checked={soNaoLidas} onChange={e => setSoNaoLidas(e.target.checked)} /> Só não lidos</label>
            <span className="espaco" />
            {naoLidas > 0 && (
              <button className="fr-btn-link" onClick={async () => { await req('POST', 'notificacoes/lidas', { usuario_id: nav.usuario?.id }); setLista(l => l.map(x => ({ ...x, lida: 1 }))); }}>
                <CheckCheck size={14} /> Marcar todos como lidos
              </button>
            )}
          </div>
          {!visiveis.length && <p className="avisos-vazio muted">Nenhum aviso{soNaoLidas ? ' não lido' : ''}. Quando alguém marcar você com @, responder ou atribuir um item, aparece aqui.</p>}
          <div className="avisos-lista">
            {visiveis.map(n => {
              const u = nav.usuarios.find(x => x.id === n.de_usuario_id);
              const Ic = ICONE[n.tipo] ?? Bell;
              return (
                <button key={n.id} className={`aviso${n.lida ? '' : ' nao-lido'}`} onClick={() => abrir(n)}>
                  <span className="aviso-av"><Avatar nome={u?.nome ?? '?'} cor={u?.cor} tamanho={34} /><span className="aviso-tipo"><Ic size={11} /></span></span>
                  <span className="aviso-corpo">
                    <span><strong>{u?.nome ?? 'Alguém'}</strong> {n.texto}</span>
                    <small className="muted">{n.item_nome ?? 'item excluído'}{n.quadro_nome ? ` · ${n.quadro_nome}` : ''} · {tempoRelativo(n.criado_em)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}
