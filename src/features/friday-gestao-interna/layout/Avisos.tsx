import { useEffect, useState } from 'react';
import { useNavigate } from '../rotas.tsx';
import { AtSign, Bell, CheckCheck, LayoutGrid, MoreHorizontal, Search, X } from 'lucide-react';
import { api, observarMeusAvisos, req, type Row } from '../api.ts';
import { agruparAvisos, filtrarAvisos, trechoDoAviso } from '../avisos.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Menu, Popover, usePopover } from '../ui/base.tsx';
import { tempoRelativo } from '../quadro/Atualizacoes.tsx';

// Sino do Friday, no cabeçalho do sistema (components/Header.tsx reserva o espaço enquanto o Friday está aberto):
// avisos de menção (@), em tempo real. O painel segue o do monday: busca, "Só não lidos", grupos por período e,
// em cada cartão, o tempo e a bolinha de não lido à direita. Clicar abre o item na aba Atualizações e marca como lido.
export function Avisos() {
  const nav = useNav();
  const navigate = useNavigate();
  const pop = usePopover<HTMLButtonElement>();
  const mais = usePopover<HTMLButtonElement>();
  const [lista, setLista] = useState<Row[]>([]);
  const [soNaoLidas, setSoNaoLidas] = useState(false);
  const [busca, setBusca] = useState('');

  useEffect(() => (nav.usuario ? observarMeusAvisos(setLista) : undefined), [nav.usuario]);

  const nomeDe = (n: Row) => nav.usuarios.find(x => x.id === n.de_usuario_id)?.nome ?? 'Alguém';
  const naoLidas = lista.filter(n => !n.lida).length;
  const abrir = (n: Row) => {
    pop.fechar();
    if (!n.lida) api.update('notificacoes', n.id, { lida: 1 }).catch(e => console.warn('[friday] aviso não marcado como lido', e));
    if (n.quadro_id) navigate(`/quadros/${n.quadro_id}?item=${n.item_id}&aba=atualizacoes`);
  };
  const marcarTodos = () => { req('POST', 'notificacoes/lidas').catch(e => console.warn('[friday] avisos não marcados como lidos', e)); };
  const filtrados = filtrarAvisos(soNaoLidas ? lista.filter(n => !n.lida) : lista, busca, n => [nomeDe(n), n.item_nome, n.quadro_nome, trechoDoAviso(n.texto)]);
  const grupos = agruparAvisos(filtrados, new Date(), n => n.criado_em);

  return (
    <>
      <button ref={pop.ref} className="sino" aria-label={`Avisos${naoLidas ? `: ${naoLidas} não lidos` : ''}`} title="Avisos" onClick={pop.alternar}>
        <Bell size={20} />{naoLidas > 0 && <span className="sino-n">{naoLidas > 9 ? '9+' : naoLidas}</span>}
      </button>
      {pop.aberto && (
        // Com o menu ⋯ aberto, Esc ou um clique fora fecham só o menu.
        <Popover ancora={pop.ref.current} onClose={mais.aberto ? mais.fechar : pop.fechar} alinhar="fim" largura={460} className="avisos-painel">
          <div className="avisos-topo">
            <h3>Avisos</h3>
            <span className="espaco" />
            <button ref={mais.ref} className="btn-icone" aria-label="Mais opções dos avisos" title="Mais opções" onClick={mais.alternar}><MoreHorizontal size={18} /></button>
            <button className="btn-icone" aria-label="Fechar os avisos" title="Fechar" onClick={pop.fechar}><X size={18} /></button>
          </div>
          {mais.aberto && (
            <Popover ancora={mais.ref.current} onClose={mais.fechar} alinhar="fim">
              <Menu onEscolher={mais.fechar} itens={[{ rotulo: 'Marcar todos como lidos', icone: <CheckCheck size={15} />, onClick: marcarTodos }]} />
            </Popover>
          )}
          <div className="avisos-filtros">
            <label className="avisos-busca">
              <Search size={15} />
              <input placeholder="Buscar por pessoa, item ou quadro" value={busca} onChange={e => setBusca(e.target.value)} />
            </label>
            <label className="avisos-so-nao-lidos">
              <span className="chave"><input type="checkbox" checked={soNaoLidas} onChange={e => setSoNaoLidas(e.target.checked)} /><span /></span>
              Só não lidos
            </label>
          </div>
          <div className="avisos-lista">
            {!grupos.length && (
              <p className="avisos-vazio muted">
                {busca.trim() ? 'Nenhum aviso encontrado.' : `Nenhum aviso${soNaoLidas ? ' não lido' : ''}. Quando alguém marcar você com @ numa atualização, aparece aqui.`}
              </p>
            )}
            {grupos.map(g => (
              <section key={g.periodo} className="avisos-grupo">
                <h4>{g.periodo}</h4>
                {g.avisos.map(n => {
                  const u = nav.usuarios.find(x => x.id === n.de_usuario_id);
                  const trecho = trechoDoAviso(n.texto);
                  return (
                    <button key={n.id} className={`aviso${n.lida ? '' : ' nao-lido'}`} onClick={() => abrir(n)}>
                      <span className="aviso-av"><Avatar nome={u?.nome ?? '?'} cor={u?.cor} tamanho={34} /><span className="aviso-tipo"><AtSign size={11} /></span></span>
                      <span className="aviso-corpo">
                        <span className="aviso-acao"><strong>{nomeDe(n)}</strong> mencionou você em <strong>{n.item_nome ?? 'item excluído ou sem acesso'}</strong></span>
                        {trecho && <span className="aviso-trecho">{trecho}</span>}
                        {n.quadro_nome && <span className="aviso-quadro"><LayoutGrid size={13} />{n.quadro_nome}</span>}
                      </span>
                      <span className="aviso-lado">
                        <small>{tempoRelativo(n.criado_em)}</small>
                        {!n.lida && <span className="aviso-ponto" aria-label="Não lido" />}
                      </span>
                    </button>
                  );
                })}
              </section>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
