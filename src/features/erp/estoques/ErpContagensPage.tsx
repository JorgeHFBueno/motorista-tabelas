import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import SearchIcon from '@mui/icons-material/Search';
import '../erpElevor.css';
import { Linha, TabelaDivergencias, type LinhaDivergencia } from './campos';
import { AVISO_ESTOQUES, CONTAGENS_EXEMPLO, data, divergencias, EMPRESAS, USUARIOS_CONTAGEM } from './estoquesExemplo';

// /erp/estoques/contagens: Consulta Contagem de Produtos/Volumes (CL_Volumes do Elevor): Empresa, Código, Período e
// Usuário; grade Código, Data e Status com a caixa para marcar; os botões do Elevor agem nas contagens marcadas.
// "Listar Divergentes"/"não Divergentes" mostram embaixo o contado contra o saldo do sistema na data da contagem.
// "Faturar Selecionados" depende de Pedidos e Notas, que não estão no painel. Demonstração: nada é gravado.

const PADRAO = { empresa: '1', codigo: '', de: '', ate: '', usuario: '' };
type Filtros = typeof PADRAO;

export default function ErpContagensPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Filtros>(PADRAO);
  const [aplicado, setAplicado] = useState<Filtros>(PADRAO);
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [lista, setLista] = useState<{ titulo: string; linhas: LinhaDivergencia[] } | null>(null);
  const [mensagem, setMensagem] = useState('');
  const campo = (chave: keyof Filtros) => ({ value: form[chave], onChange: (e: { target: { value: string } }) => setForm((f) => ({ ...f, [chave]: e.target.value })) });

  const linhas = useMemo(() => CONTAGENS_EXEMPLO.filter((c) => c.empresa === Number(aplicado.empresa)
    && (!aplicado.codigo.trim() || String(c.codigo) === aplicado.codigo.trim()) && (!aplicado.de || c.data >= aplicado.de)
    && (!aplicado.ate || c.data <= aplicado.ate) && (!aplicado.usuario || c.usuario === aplicado.usuario))
    .sort((a, b) => b.codigo - a.codigo), [aplicado]);
  const selecionadas = linhas.filter((c) => marcadas.includes(c.codigo));
  const todas = linhas.length > 0 && selecionadas.length === linhas.length;

  const listar = (divergentes: boolean) => {
    setMensagem('');
    if (!selecionadas.length) { setLista(null); setMensagem('Marque as contagens na grade.'); return; }
    const itens = selecionadas.flatMap((c) => divergencias(c).map((i) => ({ ...i, contagem: c.codigo })))
      .filter((i) => (i.diferenca !== 0) === divergentes);
    setLista({ titulo: divergentes ? 'Produtos divergentes' : 'Produtos não divergentes', linhas: itens });
  };
  const atualizar = () => {
    setLista(null);
    setMensagem(selecionadas.length
      ? 'Demonstração: nada foi gravado. No ERP, cada diferença das contagens marcadas vira um acerto no Kardex e a contagem passa a "Estoque Atualizado".'
      : 'Marque as contagens na grade.');
  };

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      <form className="relatorio-elevor" onSubmit={(e) => { e.preventDefault(); setAplicado(form); setMarcadas([]); setLista(null); setMensagem(''); }}>
        <Linha rotulo="Empresa:" id="contagens-empresa">
          <select id="contagens-empresa" className="campo cheio" {...campo('empresa')}>
            {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Código:" id="contagens-codigo"><input id="contagens-codigo" className="campo curto" inputMode="numeric" {...campo('codigo')} /></Linha>
        <Linha rotulo="Período:" id="contagens-de">
          <input id="contagens-de" type="date" className="campo" {...campo('de')} /> a <input type="date" className="campo" aria-label="Período: até" {...campo('ate')} />
        </Linha>
        <Linha rotulo="Usuário:" id="contagens-usuario">
          <select id="contagens-usuario" className="campo medio" {...campo('usuario')}>
            <option value="" />{USUARIOS_CONTAGEM.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Linha>
        <div className="botoes">
          <button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/estoques/contagens/nova')}><AddCircleOutlineIcon /> Novo</button>
          <button className="btn" type="button" onClick={() => listar(false)}>Listar não Divergentes</button>
          <button className="btn" type="button" onClick={() => listar(true)}>Listar Divergentes</button>
          <button className="btn" type="button" onClick={atualizar}>Atualizar Estoque</button>
          <button className="btn" type="button" disabled title="Depende de Pedidos e Notas, que ainda não estão no painel.">Faturar Selecionados</button>
        </div>
      </form>

      <div className="consulta-cad">
        {mensagem && <div className="mensagem">{mensagem}</div>}
        <table className="grade">
          <thead>
            <tr>
              <th className="marcar">
                <input type="checkbox" aria-label="Marcar todas" checked={todas} onChange={(e) => setMarcadas(e.target.checked ? linhas.map((c) => c.codigo) : [])} />
              </th>
              <th>Código</th><th>Data</th><th>Status</th><th className="icone-linha" />
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.codigo}>
                <td className="marcar">
                  <input type="checkbox" aria-label={`Marcar contagem ${c.codigo}`} checked={marcadas.includes(c.codigo)}
                    onChange={(e) => setMarcadas((m) => (e.target.checked ? [...m, c.codigo] : m.filter((x) => x !== c.codigo)))} />
                </td>
                <td><Link className="linha-link" to={`/erp/estoques/contagens/${c.codigo}`}>{c.codigo}</Link></td>
                <td>{data(c.data)}</td>
                <td>{c.status}</td>
                <td className="icone-linha"><Link to={`/erp/estoques/contagens/${c.codigo}`} title="Abrir"><AssignmentOutlinedIcon /></Link></td>
              </tr>
            ))}
            {!linhas.length && <tr><td colSpan={5} className="vazio">Nenhuma contagem encontrada.</td></tr>}
          </tbody>
        </table>
        {lista && <TabelaDivergencias titulo={lista.titulo} linhas={lista.linhas} comContagem />}
      </div>
    </div>
  );
}
