import { useMemo, useState } from 'react';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import Paginacao from './Paginacao';
import { AVISO_DEMONSTRACAO, VENDEDORES_EXEMPLO } from './pessoasExemplo';

// /erp/vendedores: Consulta de Vendedores e a ficha (Cadastro de Vendedores) no layout do Elevor, como o cadastro simples
// do ERP do Samuel: Pesquisa e Situação no centro, grade Cod, Nome, Comissão e Ativo; a ficha abre na própria tela.
// Demonstração: nada é gravado.

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const VENDEDORES = VENDEDORES_EXEMPLO.map(([nome, email, comissao, ativo], i) => ({ codigo: i + 1, nome, email, comissao, ativo: ativo === 'Sim' }));
type Vendedor = (typeof VENDEDORES)[number];

function FichaVendedor({ vendedor: v, onConsultar, onNovo }: { vendedor: Vendedor | null; onConsultar: () => void; onNovo: () => void }) {
  const [mensagem, setMensagem] = useState('');
  useTituloPagina('Cadastro de Vendedores');
  return (
    <form className="ficha-cad" onSubmit={(e) => { e.preventDefault(); setMensagem('Demonstração: nada foi gravado.'); }}>
      <div className="fc-linha"><div className="fc-rotulo">Cod:</div><div className="fc-controle largo"><input className="campo curto" aria-label="Cod" value={v ? v.codigo : ''} readOnly /></div></div>
      <div className="fc-linha"><div className="fc-rotulo">Nome:</div><div className="fc-controle largo"><input className="campo medio" aria-label="Nome" defaultValue={v?.nome} /></div></div>
      <div className="fc-linha"><div className="fc-rotulo">E-mail:</div><div className="fc-controle largo"><input className="campo cheio" aria-label="E-mail" defaultValue={v?.email} /></div></div>
      <div className="fc-linha">
        <div className="fc-rotulo">Comissão (%):</div>
        <div className="fc-controle largo"><span className="com-sufixo"><input className="campo curto" aria-label="Comissão (%)" inputMode="decimal" defaultValue={v?.comissao} /><span className="muted">%</span></span></div>
      </div>
      <div className="fc-linha"><div className="fc-rotulo">Ativo:</div><div className="fc-controle largo"><input type="checkbox" aria-label="Ativo" defaultChecked={v?.ativo ?? true} /></div></div>
      {mensagem && <div className="mensagem">{mensagem}</div>}
      <div className="botoes">
        <button className="btn primario" type="submit">Gravar</button>
        <button className="btn" type="button" onClick={onNovo}>Novo</button>
        <button className="btn" type="button" disabled={!v} onClick={() => setMensagem('Demonstração: nada foi excluído.')}>Excluir</button>
        <button className="btn" type="button" onClick={onConsultar}>Consultar</button>
      </div>
    </form>
  );
}

export default function ErpVendedoresPage() {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);
  // Sem `aberto`: consulta. Com ele: a ficha do vendedor, ou de um novo (vendedor null); a chave recomeça a ficha.
  const [aberto, setAberto] = useState<{ vendedor: Vendedor | null; chave: number } | undefined>();

  const visiveis = useMemo(() => VENDEDORES.filter((v) => (situacao === 'todos' || v.ativo === (situacao === 'ativos'))
    && (!busca.trim() || semAcento(v.nome).includes(semAcento(busca.trim())))), [busca, situacao]);
  const abrir = (vendedor: Vendedor | null) => setAberto({ vendedor, chave: Date.now() });

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_DEMONSTRACAO}</div>
      {aberto ? (
        <FichaVendedor key={aberto.chave} vendedor={aberto.vendedor} onConsultar={() => setAberto(undefined)} onNovo={() => abrir(null)} />
      ) : (
        <div className="consulta-cad">
          <form className="consulta-cad-filtros" onSubmit={(e) => { e.preventDefault(); setBusca(texto); setPagina(0); }}>
            <label className="cc-rotulo" htmlFor="vendedores-pesquisa">Pesquisa:</label>
            <div className="cc-controle"><input id="vendedores-pesquisa" className="campo cheio" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus /></div>
            <div className="cc-botoes">
              <button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button>
              <button className="btn" type="button" onClick={() => abrir(null)}><AddCircleOutlineIcon /> Novo</button>
            </div>
            <span className="cc-rotulo">Situação:</span>
            <div className="cc-controle">
              <div className="opcoes">
                {[['todos', 'Todos'], ['ativos', 'Ativos'], ['inativos', 'Inativos']].map(([valor, rotulo]) => (
                  <label key={valor} className="opcao">
                    <input type="radio" name="situacao" checked={situacao === valor} onChange={() => { setSituacao(valor); setPagina(0); }} /> {rotulo}
                  </label>
                ))}
              </div>
            </div>
            <div />
          </form>
          <table className="grade">
            <thead><tr><th>Cod</th><th>Nome</th><th>Comissão (%)</th><th>Ativo</th></tr></thead>
            <tbody>
              {visiveis.slice(pagina * porPagina, (pagina + 1) * porPagina).map((v) => (
                <tr key={v.codigo}>
                  <td><a className="linha-link" href="#" onClick={(e) => { e.preventDefault(); abrir(v); }}>{v.codigo}</a></td>
                  <td><a className="linha-link" href="#" onClick={(e) => { e.preventDefault(); abrir(v); }}>{v.nome}</a></td>
                  <td>{v.comissao}</td>
                  <td>{v.ativo ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
              {!visiveis.length && <tr><td colSpan={4} className="vazio">Nenhum registro encontrado.</td></tr>}
            </tbody>
          </table>
          <Paginacao total={visiveis.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina}
            onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
        </div>
      )}
    </div>
  );
}
