import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useNavigate } from '../rotas.tsx';
import { Archive, ArchiveRestore, Columns3, LayoutGrid, ListTree, Rows3, Search, Trash2 } from 'lucide-react';
import { req, type Row } from '../api.ts';
import { useNav } from '../nav.tsx';
import { useAvisoRapido, useConfirmar } from '../ui/base.tsx';
import { fmtData } from '../util.ts';

const TABELA: Record<string, string> = { quadro: 'quadros', grupo: 'grupos', item: 'itens', subitem: 'itens' };
const ICONE: Record<string, typeof Rows3> = { quadro: LayoutGrid, grupo: Columns3, item: Rows3, subitem: ListTree };
const NOME_TIPO: Record<string, string> = { quadro: 'Quadro', grupo: 'Grupo', item: 'Item', subitem: 'Subitem' };

// Arquivados e lixeira: restaurar, mandar para a lixeira ou apagar de vez. A lixeira se esvazia sozinha após 30 dias.
export default function Arquivo() {
  const nav = useNav();
  const navigate = useNavigate();
  const confirmar = useConfirmar();
  const avisar = useAvisoRapido();
  const [params, setParams] = useSearchParams();
  const estado = params.get('aba') === 'lixeira' ? 'lixeira' : 'arquivado';
  const quadro = Number(params.get('quadro')) || null;
  const [lista, setLista] = useState<Row[] | null>(null);
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState('');

  const carregar = () => {
    setLista(null);
    req<Row[]>('GET', `arquivo?estado=${estado}${quadro ? `&quadro_id=${quadro}` : ''}`).then(setLista);
  };
  useEffect(carregar, [estado, quadro]);

  const mudar = (campos: Record<string, string | null>) => setParams(p => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(campos)) { if (v) n.set(k, v); else n.delete(k); }
    return n;
  });
  const filtrada = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return (lista ?? []).filter(l => (!tipo || l.tipo === tipo) && (!b || `${l.nome} ${l.quadro_nome ?? ''} ${l.grupo_nome ?? ''}`.toLowerCase().includes(b)));
  }, [lista, busca, tipo]);
  const nomeQuadro = quadro ? nav.quadros.find(q => q.id === quadro)?.nome ?? (lista ?? []).find(l => l.quadro_id === quadro)?.quadro_nome : null;

  const restaurar = async (l: Row) => {
    await req('POST', `${TABELA[l.tipo]}/${l.id}/restaurar`);
    setLista(x => x && x.filter(y => !(y.tipo === l.tipo && y.id === l.id)));
    if (l.tipo === 'quadro') await nav.recarregar();
    avisar(`“${l.nome}” foi restaurado.`, { rotulo: 'Abrir', onClick: () => navigate(l.tipo === 'item' ? `/quadros/${l.quadro_id}?item=${l.id}` : `/quadros/${l.quadro_id}`) });
  };
  const paraLixeira = async (l: Row) => {
    await req('DELETE', `${TABELA[l.tipo]}/${l.id}`);
    setLista(x => x && x.filter(y => !(y.tipo === l.tipo && y.id === l.id)));
    avisar(`“${l.nome}” foi para a lixeira.`);
  };
  const apagarDeVez = async (l: Row) => {
    const extra = l.tipo === 'quadro' ? ' com todos os grupos, itens, atualizações e arquivos' : l.tipo === 'grupo' ? ' com todos os itens' : '';
    if (!(await confirmar(`Apagar “${l.nome}”${extra} de vez? Isso não pode ser desfeito.`, 'Apagar de vez'))) return;
    await req('DELETE', `${TABELA[l.tipo]}/${l.id}?definitivo=1`);
    setLista(x => x && x.filter(y => !(y.tipo === l.tipo && y.id === l.id)));
  };

  return (
    <div className="pagina">
      <header className="pagina-cab">
        <div>
          <h1>Arquivo e lixeira</h1>
          <p className="muted">
            {estado === 'lixeira' ? 'Itens, grupos e quadros excluídos. Ficam aqui por 30 dias e depois são apagados de vez.' : 'Itens, grupos e quadros arquivados: saem da vista, mas continuam guardados.'}
            {nomeQuadro && <> Mostrando só <strong>{nomeQuadro}</strong> · <button className="fr-btn-link" onClick={() => mudar({ quadro: null })}>ver de todos os quadros</button></>}
          </p>
        </div>
      </header>
      <nav className="abas-visoes arquivo-abas">
        <button className={`aba-visao${estado === 'arquivado' ? ' on' : ''}`} onClick={() => mudar({ aba: null })}><Archive size={15} /> Arquivados</button>
        <button className={`aba-visao${estado === 'lixeira' ? ' on' : ''}`} onClick={() => mudar({ aba: 'lixeira' })}><Trash2 size={15} /> Lixeira</button>
      </nav>
      <div className="arquivo-barra">
        <label className="busca-barra"><Search size={15} /><input placeholder="Buscar pelo nome, quadro ou grupo" value={busca} onChange={e => setBusca(e.target.value)} /></label>
        <select className="arquivo-tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
          <option value="">Tudo</option><option value="quadro">Quadros</option><option value="grupo">Grupos</option><option value="item">Itens</option><option value="subitem">Subitens</option>
        </select>
        {lista && <span className="muted fr-small">{filtrada.length} de {lista.length}</span>}
      </div>
      {!lista ? <p className="muted">Carregando…</p> : !filtrada.length ? (
        <div className="vazio-painel">{estado === 'lixeira' ? <Trash2 size={36} /> : <Archive size={36} />}<p>{lista.length ? 'Nada encontrado com essa busca.' : estado === 'lixeira' ? 'A lixeira está vazia.' : 'Nada arquivado.'}</p></div>
      ) : (
        <div className="arquivo-lista">
          {filtrada.map(l => {
            const Ic = ICONE[l.tipo] ?? Rows3;
            return (
              <div key={`${l.tipo}${l.id}`} className="arquivo-linha">
                <span className="arquivo-ic" title={NOME_TIPO[l.tipo]}><Ic size={16} /></span>
                <div className="arquivo-nome">
                  <strong>{l.nome}</strong>
                  <small className="muted">{NOME_TIPO[l.tipo]}{l.tipo !== 'quadro' ? ` em ${l.quadro_nome}${l.grupo_nome ? ` · ${l.tipo === 'subitem' ? 'item ' : ''}${l.grupo_nome}` : ''}` : ''}</small>
                </div>
                <small className="muted arquivo-quando">
                  {estado === 'lixeira' ? 'Excluído' : 'Arquivado'} em {fmtData(String(l.quando))} {String(l.quando).slice(11, 16)}
                  {estado === 'lixeira' && l.dias_restantes != null && <><br />apagado de vez em {l.dias_restantes} {l.dias_restantes === 1 ? 'dia' : 'dias'}</>}
                </small>
                <button className="fr-btn" onClick={() => restaurar(l)}><ArchiveRestore size={15} /> Restaurar</button>
                {estado === 'arquivado'
                  ? <button className="btn-icone" title="Mandar para a lixeira" aria-label={`Mandar ${l.nome} para a lixeira`} onClick={() => paraLixeira(l)}><Trash2 size={16} /></button>
                  : <button className="fr-btn btn-perigo-texto" onClick={() => apagarDeVez(l)}>Apagar de vez</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
