import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { useNavigate } from '../rotas.tsx';
import { historico, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { DescricaoAtividade } from '../quadro/PainelItem.tsx';

// Histórico: as últimas 5 alterações feitas pela pessoa, em todos os quadros (registro de atividade). Cada um vê as
// próprias; adm2 escolhe a pessoa. Automações não entram (não têm autor).
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;

export default function Historico() {
  const nav = useNav();
  const navigate = useNavigate();
  const eu = nav.usuario!;
  const [uid, setUid] = useState(eu.id);
  const [lista, setLista] = useState<Row[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setLista(null);
    historico(uid)
      .then(l => { if (vivo) { setLista(l); setErro(null); } })
      .catch(e => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [uid]);
  const pessoas = [...nav.usuarios].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const proprio = uid === eu.id;

  return (
    <div className="pagina">
      <header className="pagina-cab">
        <div>
          <h1><History size={22} /> Histórico</h1>
          <p className="muted">{proprio ? 'Suas últimas 5 alterações' : `Últimas 5 alterações de ${nav.nomeUsuario(uid)}`}, em todos os quadros. Clique para abrir o item.</p>
        </div>
        {eu.admin && (
          <select className="arquivo-tipo" aria-label="Pessoa" value={uid} onChange={e => setUid(e.target.value)}>
            {pessoas.map(p => <option key={p.id} value={p.id}>{p.id === eu.id ? `${p.nome} (você)` : p.nome}</option>)}
          </select>
        )}
      </header>
      {erro ? <p className="aviso-erro">{erro}</p>
        : !lista ? <p className="muted">Carregando…</p>
        : !lista.length ? <div className="vazio-painel"><History size={36} /><p>Nenhuma alteração registrada.</p></div>
        : (
          <ul className="historico">
            {lista.map(a => {
              const abrir = a.abrir_quadro_id ? () => navigate(`/quadros/${a.abrir_quadro_id}${a.abrir_item_id ? `?item=${a.abrir_item_id}` : ''}`) : undefined;
              return (
                <li key={a.id} className={abrir ? 'abre' : ''} onClick={abrir} title={abrir ? 'Abrir' : 'Quadro excluído ou sem acesso'}>
                  <small className="muted">{dataBr(String(a.criado_em))}</small>
                  <span className="hist-onde">
                    <b>{a.item_nome ?? 'Quadro'}</b>
                    <small className="muted">{a.quadro_nome ?? 'Quadro excluído ou sem acesso'}</small>
                  </span>
                  <DescricaoAtividade a={a} nomePessoa={nav.nomeUsuario(a.usuario_id)} />
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}
