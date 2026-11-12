import { useEffect, useState } from 'react';
import { useNavigate } from '../rotas.tsx';
import { AtSign, Bell, CheckCheck } from 'lucide-react';
import { api, observarMeusAvisos, req, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Popover, usePopover } from '../ui/base.tsx';
import { tempoRelativo } from '../quadro/Atualizacoes.tsx';

// Sino do Friday, no cabeçalho do sistema (components/Header.tsx reserva o espaço enquanto o Friday está aberto):
// avisos de menção (@), em tempo real. Clicar abre o item na aba Atualizações e marca o aviso como lido.
export function Avisos() {
  const nav = useNav();
  const navigate = useNavigate();
  const pop = usePopover<HTMLButtonElement>();
  const [lista, setLista] = useState<Row[]>([]);
  const [soNaoLidas, setSoNaoLidas] = useState(false);

  useEffect(() => (nav.usuario ? observarMeusAvisos(setLista) : undefined), [nav.usuario]);

  const naoLidas = lista.filter(n => !n.lida).length;
  const abrir = (n: Row) => {
    pop.fechar();
    if (!n.lida) api.update('notificacoes', n.id, { lida: 1 }).catch(e => console.warn('[friday] aviso não marcado como lido', e));
    if (n.quadro_id) navigate(`/quadros/${n.quadro_id}?item=${n.item_id}&aba=atualizacoes`);
  };
  const visiveis = soNaoLidas ? lista.filter(n => !n.lida) : lista;

  return (
    <>
      <button ref={pop.ref} className="sino" aria-label={`Avisos${naoLidas ? `: ${naoLidas} não lidos` : ''}`} title="Avisos" onClick={pop.alternar}>
        <Bell size={20} />{naoLidas > 0 && <span className="sino-n">{naoLidas > 9 ? '9+' : naoLidas}</span>}
      </button>
      {pop.aberto && (
        <Popover ancora={pop.ref.current} onClose={pop.fechar} alinhar="fim" largura={420}>
          <div className="avisos-cab">
            <strong>Avisos</strong>
            <label className="check-form"><input type="checkbox" className="caixa" checked={soNaoLidas} onChange={e => setSoNaoLidas(e.target.checked)} /> Só não lidos</label>
            <span className="espaco" />
            {naoLidas > 0 && (
              <button className="fr-btn-link" onClick={() => req('POST', 'notificacoes/lidas').catch(e => console.warn('[friday] avisos não marcados como lidos', e))}>
                <CheckCheck size={14} /> Marcar todos como lidos
              </button>
            )}
          </div>
          {!visiveis.length && <p className="avisos-vazio muted">Nenhum aviso{soNaoLidas ? ' não lido' : ''}. Quando alguém marcar você com @ numa atualização, aparece aqui.</p>}
          <div className="avisos-lista">
            {visiveis.map(n => {
              const u = nav.usuarios.find(x => x.id === n.de_usuario_id);
              return (
                <button key={n.id} className={`aviso${n.lida ? '' : ' nao-lido'}`} onClick={() => abrir(n)}>
                  <span className="aviso-av"><Avatar nome={u?.nome ?? '?'} cor={u?.cor} tamanho={34} /><span className="aviso-tipo"><AtSign size={11} /></span></span>
                  <span className="aviso-corpo">
                    <span><strong>{u?.nome ?? 'Alguém'}</strong> {n.texto}</span>
                    <small className="muted">{n.item_nome ?? 'item excluído ou sem acesso'}{n.quadro_nome ? ` · ${n.quadro_nome}` : ''} · {tempoRelativo(n.criado_em)}</small>
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
