import { useEffect, useState } from 'react';
import { Lock, Trash2, Unlock } from 'lucide-react';
import { gravarPermissoes, lerPermissoes } from '../api.ts';
import { useNav } from '../nav.tsx';
import { Avatar, Modal, useAvisoRapido } from '../ui/base.tsx';

// Quem vê um quadro (só adm2 muda). Aberto: todos que entram no Friday. Restrito: só a lista, que vê e edita tudo no
// quadro. Os subitens seguem o quadro; adm2 vê todos os quadros.
export function Permissoes({ id, nome, onFechar }: { id: number; nome: string; onFechar: () => void }) {
  const nav = useNav();
  const avisar = useAvisoRapido();
  const [restrito, setRestrito] = useState(false);
  const [lista, setLista] = useState<string[] | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    lerPermissoes(id)
      .then(r => { setRestrito(r.restrito); setLista(r.lista); })
      .catch(e => setErro((e as Error).message));
  }, [id]);
  const pessoa = (uid: string) => nav.usuarios.find(u => u.id === uid);
  // Para acrescentar: quem entra no Friday sem ser adm2 (adm2 já vê todos os quadros).
  const fora = nav.usuarios.filter(u => u.ativo && u.friday && !u.adm2 && !lista?.includes(u.id));
  const salvar = async () => {
    try {
      await gravarPermissoes(id, { restrito, lista: restrito ? lista : [] });
      await nav.recarregar();
      avisar(restrito ? `“${nome}” agora é restrito.` : `“${nome}” está aberto para a equipe.`);
      onFechar();
    } catch (e) { setErro((e as Error).message); }
  };
  return (
    <Modal titulo={`Permissões do quadro “${nome}”`} largura={560} onClose={onFechar}
      rodape={<><button className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" disabled={!lista} onClick={salvar}>Salvar permissões</button></>}>
      {erro && <p className="aviso-erro">{erro}</p>}
      {lista && (
        <>
          <div className="perm-opcoes">
            <label className={`perm-opcao${!restrito ? ' on' : ''}`}>
              <input type="radio" checked={!restrito} onChange={() => setRestrito(false)} />
              <Unlock size={16} /><span><strong>Aberto</strong><small className="muted">Todos que entram no Friday.</small></span>
            </label>
            <label className={`perm-opcao${restrito ? ' on' : ''}`}>
              <input type="radio" checked={restrito} onChange={() => setRestrito(true)} />
              <Lock size={16} /><span><strong>Restrito</strong><small className="muted">Só as pessoas da lista abaixo (e os administradores).</small></span>
            </label>
          </div>
          {restrito && (
            <div className="perm-lista">
              {lista.map(uid => {
                const u = pessoa(uid);
                return (
                  <div key={uid} className="perm-linha">
                    <Avatar nome={String(u?.nome ?? '?')} cor={u?.cor} tamanho={26} />
                    <span className="perm-nome">{u?.nome ?? '?'}{u && !u.ativo ? ' (inativo)' : ''}</span>
                    <button className="btn-icone" aria-label={`Tirar ${u?.nome ?? 'pessoa'}`} onClick={() => setLista(l => l!.filter(x => x !== uid))}><Trash2 size={15} /></button>
                  </div>
                );
              })}
              {!lista.length && <p className="muted fr-small">Ninguém na lista ainda: só os administradores vão ver.</p>}
              <select className="perm-adicionar" value="" onChange={e => { const v = e.target.value; if (v) setLista(l => [...l!, v]); }}>
                <option value="">+ Adicionar pessoa…</option>
                {fora.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </div>
          )}
          <p className="muted fr-small">Quem está na lista vê e edita tudo no quadro, inclusive os subitens. Administradores sempre veem todos os quadros.</p>
        </>
      )}
    </Modal>
  );
}
