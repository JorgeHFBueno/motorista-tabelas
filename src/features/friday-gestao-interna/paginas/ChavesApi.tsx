import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Plus } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { criarChaveApi, ENDERECO_API, listarChavesApi, revogarChaveApi, type ChaveApi } from '../chavesApi.ts';
import { useNav } from '../nav.tsx';
import { Modal, useConfirmar } from '../ui/base.tsx';

// Chaves da API de leitura do Friday (só adm2). Cada chave vale por uma pessoa e enxerga só o que ela vê no Friday;
// serve para robôs e assistentes consultarem quadros e itens. A chave aparece uma vez, na criação.
const dataBr = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}` : '—');

export default function ChavesApi() {
  const { authorizationProfile } = useAuth();
  const nav = useNav();
  const confirmar = useConfirmar();
  const [chaves, setChaves] = useState<ChaveApi[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [criada, setCriada] = useState<{ chave: string; pessoa: string } | null>(null);
  const carregar = useCallback(async () => {
    try { setChaves(await listarChavesApi()); setErro(null); } catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  if (authorizationProfile?.adm2 !== true) return <div className="pagina"><h1>Chaves de API</h1><p className="muted">Disponível só para adm2.</p></div>;

  const nome = (uid: string) => nav.nomeUsuario(uid);
  const revogar = async (c: ChaveApi) => {
    if (!(await confirmar(`Revogar a chave “${c.nome}” (…${c.sufixo}) de ${nome(c.uid)}? Quem usa essa chave perde o acesso na hora.`, 'Revogar'))) return;
    try { await revogarChaveApi(c.hash, nav.usuario!.id); await carregar(); } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="pagina">
      <header className="pagina-cab">
        <div>
          <h1><KeyRound size={22} /> Chaves de API</h1>
          <p className="muted">Leitura do Friday para robôs e assistentes. Cada chave vale por uma pessoa e vê só o que ela vê aqui (quadros abertos e os restritos em que ela está). Só leitura: nada é gravado pela chave.</p>
        </div>
        <button className="fr-btn btn-primario" onClick={() => setNova(true)}><Plus size={15} /> Nova chave</button>
      </header>
      {erro && <p className="aviso-erro">{erro}</p>}
      {chaves && !chaves.length && <p className="muted">Nenhuma chave criada.</p>}
      {chaves && chaves.length > 0 && (
        <table className="tabela-chaves">
          <thead><tr><th>Descrição</th><th>Pessoa</th><th>Chave</th><th>Criada</th><th>Último uso</th><th>Situação</th><th /></tr></thead>
          <tbody>
            {chaves.map(c => (
              <tr key={c.hash} className={c.revogada_em ? 'revogada' : ''}>
                <td>{c.nome}</td>
                <td>{nome(c.uid)}</td>
                <td><code>fri_…{c.sufixo}</code></td>
                <td title={`por ${nome(c.criado_por)}`}>{dataBr(c.criado_em)}</td>
                <td>{dataBr(c.ultimo_uso)}</td>
                <td>{c.revogada_em ? <span title={`por ${nome(c.revogada_por ?? '')}`}>Revogada em {dataBr(c.revogada_em)}</span> : 'Ativa'}</td>
                <td>{!c.revogada_em && <button className="fr-btn btn-pequeno" onClick={() => void revogar(c)}>Revogar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <section className="chaves-ajuda">
        <h3>Como usar</h3>
        <p className="muted">Mande a chave no cabeçalho <code>X-Friday-Chave</code> (só GET):</p>
        <ul className="muted">
          <li><code>{ENDERECO_API}/eu</code>: de quem é a chave.</li>
          <li><code>{ENDERECO_API}/quadros</code>: áreas, pastas e quadros que a pessoa vê.</li>
          <li><code>{ENDERECO_API}/quadros/&lt;id&gt;</code>: colunas, grupos, itens e subitens, com os valores em texto.</li>
          <li><code>{ENDERECO_API}/buscar?q=coqueiros</code>: itens pelo nome, em todos os quadros; com <code>&amp;quadro=&lt;id&gt;</code>, procura também nos valores daquele quadro (ex.: o subcentro).</li>
        </ul>
      </section>
      {nova && <NovaChave onFechar={() => setNova(false)} onCriada={(chave, pessoa) => { setNova(false); setCriada({ chave, pessoa }); void carregar(); }} />}
      {criada && (
        <Modal titulo="Chave criada" largura={640} onClose={() => setCriada(null)} rodape={<button className="fr-btn btn-primario" onClick={() => setCriada(null)}>Já copiei</button>}>
          <p>Copie agora: <strong>ela não aparece de novo</strong>. Vale pelo acesso de {criada.pessoa}.</p>
          <div className="chave-criada"><code>{criada.chave}</code>
            <button className="fr-btn btn-pequeno" onClick={() => void navigator.clipboard.writeText(criada.chave)}><Copy size={14} /> Copiar</button>
          </div>
          <p className="muted fr-small">Exemplo: <code>curl -H "X-Friday-Chave: {criada.chave}" "{ENDERECO_API}/buscar?q=coqueiros"</code></p>
        </Modal>
      )}
    </div>
  );
}

function NovaChave({ onFechar, onCriada }: { onFechar: () => void; onCriada: (chave: string, pessoa: string) => void }) {
  const nav = useNav();
  const pessoas = nav.usuarios.filter(u => u.ativo && u.friday).sort((a, b) => a.nome.localeCompare(b.nome));
  const [uid, setUid] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const criar = async () => {
    if (!uid || !descricao.trim()) return;
    setSalvando(true);
    try { onCriada(await criarChaveApi(uid, descricao, nav.usuario!.id), nav.nomeUsuario(uid)); } catch (e) { alert((e as Error).message); setSalvando(false); }
  };
  return (
    <Modal titulo="Nova chave de API" onClose={onFechar}
      rodape={<><button className="fr-btn" onClick={onFechar}>Cancelar</button><button className="fr-btn btn-primario" disabled={!uid || !descricao.trim() || salvando} onClick={() => void criar()}>Criar chave</button></>}>
      <label className="campo-form">Pessoa (a chave vê o que ela vê no Friday)
        <select value={uid} onChange={e => setUid(e.target.value)}>
          <option value="">Escolha…</option>
          {pessoas.map(u => <option key={u.id} value={u.id}>{u.nome}{u.adm2 ? ' (adm2: vê todos os quadros)' : ''}</option>)}
        </select>
      </label>
      <label className="campo-form">Descrição (para quem é, onde roda)
        <input value={descricao} maxLength={80} placeholder="Ex.: Robô de obras do Samuel" onChange={e => setDescricao(e.target.value)} />
      </label>
    </Modal>
  );
}
