import { useEffect, useState } from 'react';
import { Lock, Trash2, Unlock } from 'lucide-react';
import { req, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Modal, useAvisoRapido } from '../ui/base.tsx';

type Recurso = 'area' | 'pasta' | 'quadro';
const NOME: Record<Recurso, string> = { area: 'área de trabalho', pasta: 'pasta', quadro: 'quadro' };
const ACIMA: Record<Recurso, string> = { area: 'Todos os membros da equipe', pasta: 'Quem tem acesso à área (ou à pasta de cima)', quadro: 'Quem tem acesso à pasta ou à área onde ele está' };

// Quem pode ver/editar uma área, pasta ou quadro. Restrito = só a lista; senão vale o que está acima.
export function Permissoes({ recurso, id, nome, onFechar }: { recurso: Recurso; id: number; nome: string; onFechar: () => void }) {
  const nav = useNav();
  const avisar = useAvisoRapido();
  const [restrito, setRestrito] = useState(false);
  const [lista, setLista] = useState<{ usuario_id: string; nivel: string }[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    req<{ restrito: boolean; lista: Row[] }>('GET', `permissoes/${recurso}/${id}`)
      .then(r => { setRestrito(r.restrito); setLista(r.lista.map(x => ({ usuario_id: String(x.usuario_id), nivel: String(x.nivel) }))); })
      .catch(e => setErro((e as Error).message));
  }, [recurso, id]);
  const pessoa = (uid: string) => nav.usuarios.find(u => u.id === uid);
  const fora = nav.usuarios.filter(u => u.ativo && !lista?.some(x => x.usuario_id === u.id));
  const salvar = async () => {
    try {
      await req('PUT', `permissoes/${recurso}/${id}`, { restrito, lista: restrito ? lista : [] });
      await nav.recarregar();
      avisar(restrito ? `“${nome}” agora é restrito.` : `“${nome}” está aberto para a equipe.`);
      onFechar();
    } catch (e) { setErro((e as Error).message); }
  };
  return (
    <Modal titulo={`Permissões da ${NOME[recurso]} “${nome}”`} largura={560} onClose={onFechar}
      rodape={<><button className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" disabled={!lista} onClick={salvar}>Salvar permissões</button></>}>
      {erro && <p className="aviso-erro">{erro}</p>}
      {lista && (
        <>
          <div className="perm-opcoes">
            <label className={`perm-opcao${!restrito ? ' on' : ''}`}>
              <input type="radio" checked={!restrito} onChange={() => setRestrito(false)} />
              <Unlock size={16} /><span><strong>Aberto</strong><small className="muted">{ACIMA[recurso]}.</small></span>
            </label>
            <label className={`perm-opcao${restrito ? ' on' : ''}`}>
              <input type="radio" checked={restrito} onChange={() => setRestrito(true)} />
              <Lock size={16} /><span><strong>Restrito</strong><small className="muted">Só as pessoas da lista abaixo (e os administradores).</small></span>
            </label>
          </div>
          {restrito && (
            <div className="perm-lista">
              {lista.map(x => {
                const u = pessoa(x.usuario_id);
                return (
                  <div key={x.usuario_id} className="perm-linha">
                    <Avatar nome={String(u?.nome ?? '?')} cor={u?.cor} tamanho={26} />
                    <span className="perm-nome">{u?.nome ?? '?'}</span>
                    <select value={x.nivel} onChange={e => setLista(l => l!.map(y => (y.usuario_id === x.usuario_id ? { ...y, nivel: e.target.value } : y)))}>
                      <option value="editar">Pode editar</option><option value="ver">Só ver</option>
                    </select>
                    <button className="btn-icone" aria-label={`Tirar ${u?.nome}`} onClick={() => setLista(l => l!.filter(y => y.usuario_id !== x.usuario_id))}><Trash2 size={15} /></button>
                  </div>
                );
              })}
              {!lista.length && <p className="muted fr-small">Ninguém na lista ainda: só os administradores vão ver.</p>}
              <select className="perm-adicionar" value="" onChange={e => { const v = e.target.value; if (v) setLista(l => [...l!, { usuario_id: v, nivel: 'editar' }]); }}>
                <option value="">+ Adicionar pessoa…</option>
                {fora.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          )}
          <p className="muted fr-small">Administradores sempre veem e editam tudo. Quem é “só leitura” no sistema nunca edita, mesmo com “Pode editar”.</p>
        </>
      )}
    </Modal>
  );
}
