import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { formatarDocumento } from '../../portal-cliente/portalDominio';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import {
  AVISO_DEMONSTRACAO, CATEGORIAS, PAPEIS, PESSOAS_EXEMPLO, REGIMES, UFS, VENDEDORES_EXEMPLO, type Papel, type PessoaExemplo,
} from './pessoasExemplo';

// /erp/pessoas: Consulta de Clientes e Fornecedores no layout da CL_Clientes do Elevor (como o ERP do Samuel): Pesquisa e
// botões na mesma linha, "Mais filtros" na ordem do Elevor e a grade de 25 por página. Pesquisar aplica a pesquisa e os
// filtros. Demonstração sobre os exemplos de pessoasExemplo.ts; os filtros sem dado nos exemplos ficam só para ver.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const VAZIO = {
  tipo: '', codigo: '', descricao: '', papeis: [] as Papel[], ativo: 'sim', bairro: '', uf: '', cidade: '', vendedor: '', categoria: '', regime: '',
};
type Filtros = typeof VAZIO;

function passa(p: PessoaExemplo, busca: string, f: Filtros) {
  const b = semAcento(busca.trim());
  if (b && !semAcento(`${p.nome} ${p.fantasia} ${p.documento} ${formatarDocumento(p.documento)}`).includes(b)) return false;
  if (f.ativo !== 'todos' && p.ativo !== (f.ativo === 'sim')) return false;
  if (f.tipo && p.tipo !== f.tipo) return false;
  if (f.codigo.trim() && String(p.codigo) !== f.codigo.trim()) return false;
  if (f.descricao.trim() && !semAcento(p.nome).includes(semAcento(f.descricao.trim()))) return false;
  if (f.papeis.length && !f.papeis.some((papel) => p.papeis.includes(papel))) return false;
  if (f.bairro.trim() && !semAcento(p.bairro).includes(semAcento(f.bairro.trim()))) return false;
  if (f.uf && p.uf !== f.uf) return false;
  if (f.cidade && p.cidade !== f.cidade) return false;
  if (f.vendedor && p.vendedor !== f.vendedor) return false;
  if (f.categoria && p.categoria !== f.categoria) return false;
  return !f.regime || p.regime === f.regime;
}

function Opcoes({ nome, valor, opcoes, onChange, desabilitado }: {
  nome: string; valor: string; opcoes: Array<[string, string]>; onChange?: (v: string) => void; desabilitado?: boolean;
}) {
  return (
    <div className="opcoes">
      {opcoes.map(([v, rotulo]) => (
        <label key={v} className="opcao">
          <input type="radio" name={nome} checked={valor === v} disabled={desabilitado} onChange={() => onChange?.(v)} /> {rotulo}
        </label>
      ))}
    </div>
  );
}

const NAO_GUARDA = 'O ERP não guarda esse dado';
const VARIOS = 'Escolher vários de uma vez: o ERP pesquisa um por vez';

export default function ErpPessoasPage() {
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [f, setF] = useState<Filtros>(VAZIO);
  const [aplicado, setAplicado] = useState<Filtros>(VAZIO);
  const [mais, setMais] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);

  const visiveis = useMemo(() => PESSOAS_EXEMPLO.filter((p) => passa(p, busca, aplicado)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [busca, aplicado]);
  const cidades = [...new Set(PESSOAS_EXEMPLO.filter((p) => p.uf === f.uf).map((p) => p.cidade))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const mudar = (campo: Exclude<keyof Filtros, 'papeis'>) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [campo]: e.target.value }));
  const marcarPapel = (papel: Papel, sim: boolean) => setF((x) => ({ ...x, papeis: sim ? [...x.papeis, papel] : x.papeis.filter((y) => y !== papel) }));
  const lista = (campo: Exclude<keyof Filtros, 'papeis'>, opcoes: string[], classe = 'cp-cheio') => (
    <select className={`campo ${classe}`} value={f[campo]} onChange={mudar(campo)}>
      <option value="" />
      {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const linha = (rotulo: string, controle: ReactNode, titulo?: string) => (
    <><div className="cp-rot">{rotulo}</div><div className="cp-ctl" title={titulo}>{controle}</div></>
  );
  const varios = <button className="btn btn-icone" type="button" disabled title={VARIOS}><KeyboardDoubleArrowRightIcon /></button>;

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_DEMONSTRACAO}</div>
      <div className="consulta-cad largo">
        <form className="consulta-pessoas" onSubmit={(e) => { e.preventDefault(); setBusca(texto); setAplicado(f); setPagina(0); }}>
          {linha('Pesquisa:', <>
            <input className="campo cp-pesquisa" aria-label="Pesquisa" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
            <button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button>
            <button className="btn" type="button" onClick={() => navigate('/erp/pessoas/novo')}><AddCircleOutlineIcon /> Novo</button>
            <button className="btn" type="button" disabled title="Na demonstração, sem impressão"><PrintOutlinedIcon /> Impressão <ExpandMoreIcon /></button>
            <button className="btn" type="button" onClick={() => navigate('/erp/vendedores')}>Vendedores</button>
          </>)}
          <div />
          <div className="cp-ctl">
            <button className="btn" type="button" onClick={() => setMais((m) => !m)}>Mais filtros {mais ? <ExpandLessIcon /> : <ExpandMoreIcon />}</button>
          </div>
          {mais && (
            <>
              {linha('Tipo:', <Opcoes nome="tipo" valor={f.tipo} onChange={(v) => setF((x) => ({ ...x, tipo: v }))}
                opcoes={[['', 'Todos'], ['F', 'Física'], ['J', 'Jurídica']]} />)}
              {linha('Código:', <input className="campo cp-meia" aria-label="Código" inputMode="numeric" value={f.codigo} onChange={mudar('codigo')} />)}
              {linha('Descrição:', <input className="campo cp-cheio" aria-label="Descrição" value={f.descricao} onChange={mudar('descricao')} />)}
              <div className="cp-rot">Tipo:</div>
              <div className="cp-ctl cp-marcas">
                {PAPEIS.map((p) => (
                  <label key={p.valor} className="opcao">
                    <input type="checkbox" checked={f.papeis.includes(p.valor)} onChange={(e) => marcarPapel(p.valor, e.target.checked)} /> {p.rotulo}
                  </label>
                ))}
              </div>
              {linha('Atividade:', <select className="campo cp-cheio" aria-label="Atividade" defaultValue=""><option value="" /></select>)}
              {linha('Situação:', <>
                <div className="cp-meia"><Opcoes nome="ativo" valor={f.ativo} onChange={(v) => setF((x) => ({ ...x, ativo: v }))}
                  opcoes={[['todos', 'Todos'], ['sim', 'Ativos'], ['nao', 'Inativos']]} /></div>
                <span className="cp-meio">Situação cliente:</span>
                <select className="campo cp-meia" aria-label="Situação cliente" defaultValue=""><option value="" /></select>
              </>)}
              {linha('Bairro:', <>
                <input className="campo cp-meia" aria-label="Bairro" value={f.bairro} onChange={mudar('bairro')} />
                <span className="cp-meio">Região:</span>
                <select className="campo cp-meia" aria-label="Região" defaultValue=""><option value="" /></select>
              </>)}
              {linha('Estado - Cidade:', <>
                <select className="campo cp-uf" aria-label="Estado" value={f.uf} onChange={(e) => setF((x) => ({ ...x, uf: e.target.value, cidade: '' }))}>
                  <option value="" />{UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>{varios}
                <select className="campo cp-cidade" aria-label="Cidade" value={f.cidade} onChange={mudar('cidade')} disabled={!f.uf} title={f.uf ? undefined : 'Escolha o estado'}>
                  <option value="" />{cidades.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>{varios}
              </>)}
              {linha('Vendedor:', lista('vendedor', VENDEDORES_EXEMPLO.map((v) => v[0])))}
              {linha('Data Nasc.:', <>
                <input className="campo cp-nasc" disabled aria-label="Data de nascimento de" /> <span>a</span>
                <input className="campo cp-nasc" disabled aria-label="Data de nascimento até" /> <span className="muted">(dd/mm)</span>
              </>, NAO_GUARDA)}
              {linha('Validade dos Arquivos:', <>
                <div className="cp-meia cp-datas">
                  <input className="campo" type="date" aria-label="Validade dos arquivos de" /> <span>à</span>
                  <input className="campo" type="date" aria-label="Validade dos arquivos até" />
                </div>
                <span className="cp-meio">Cadastrados no Período:</span>
                <div className="cp-meia cp-datas">
                  <input className="campo" type="date" aria-label="Cadastrados de" /> <span>à</span>
                  <input className="campo" type="date" aria-label="Cadastrados até" />
                </div>
              </>)}
              {linha('Categoria:', lista('categoria', CATEGORIAS))}
              {linha('Regime Tributário:', lista('regime', REGIMES))}
              {linha('Canal:', <select className="campo cp-cheio" aria-label="Canal" defaultValue=""><option value="" /></select>)}
              {linha('Grupo Econômico:', <select className="campo cp-cheio" aria-label="Grupo Econômico" defaultValue=""><option value="" /></select>)}
              {linha('Gênero:', <Opcoes nome="genero" valor="" desabilitado
                opcoes={[['', 'Todos'], ['M', 'Masculino'], ['F', 'Feminino'], ['N', 'Não Informado']]} />, NAO_GUARDA)}
            </>
          )}
        </form>

        <table className="grade">
          <thead>
            <tr><th className="icone-linha" /><th>Código</th><th>Descrição</th><th>Nome Fantasia</th><th>CPF/CNPJ</th><th>Cidade - UF</th><th>Telefone</th></tr>
          </thead>
          <tbody>
            {visiveis.slice(pagina * porPagina, (pagina + 1) * porPagina).map((p) => (
              <tr key={p.codigo}>
                <td className="icone-linha"><Link to={`/erp/pessoas/${p.codigo}`} title="Abrir"><PersonOutlineOutlinedIcon /></Link></td>
                <td>{p.codigo}</td>
                <td><Link className="linha-link" to={`/erp/pessoas/${p.codigo}`}>{p.nome}</Link></td>
                <td>{p.fantasia !== p.nome ? p.fantasia : ''}</td>
                <td>{p.documento ? formatarDocumento(p.documento) : '—'}</td>
                <td>{p.cidade ? `${p.cidade} - ${p.uf}` : ''}</td>
                <td>{p.telefones[0]?.[1] ?? ''}</td>
              </tr>
            ))}
            {!visiveis.length && <tr><td colSpan={7} className="vazio">Nenhum cadastro encontrado.</td></tr>}
          </tbody>
        </table>
        <Paginacao total={visiveis.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina}
          onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
      </div>
    </div>
  );
}
