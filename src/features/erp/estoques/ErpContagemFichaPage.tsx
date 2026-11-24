import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { Linha, TabelaDivergencias, type LinhaDivergencia } from './campos';
import {
  AVISO_ESTOQUES, contagemExemplo, data, divergencias, EMPRESAS, hoje, lerNumero, num, PRODUTOS_EXEMPLO, produtoExemplo, STATUS_CONTAGEM, TIPOS_ESTOQUE,
  type ContagemExemplo, type ItemContagem, type StatusContagem,
} from './estoquesExemplo';

// /erp/estoques/contagens/:codigo ("nova" para uma nova): Nova Contagem Produtos/Volumes (CD_Volumes do Elevor). Cabeçalho
// Código, Empresa, Status, Data e Tipo de Estoque; "Adicionar Produto" por código (ou código de barras) e quantidade,
// somando quando o produto já está na lista; grade Cod, Produto, Quantidade e Data. "Outras Operações" lista os
// divergentes e os não divergentes. Contagem com o estoque já atualizado fica só para consulta. Demonstração: nada é gravado.

function Ficha({ original }: { original: ContagemExemplo | null }) {
  const navigate = useNavigate();
  useTituloPagina(original ? 'Contagem de Produtos/Volumes' : 'Nova Contagem Produtos/Volumes');
  const [cab, setCab] = useState({
    empresa: String(original?.empresa ?? 1), status: original?.status ?? 'Aberto' as StatusContagem, data: original?.data ?? hoje(),
    tipoEstoque: String(original?.tipoEstoque ?? 1),
  });
  const [itens, setItens] = useState<ItemContagem[]>(original?.itens ?? []);
  const [codigo, setCodigo] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [outras, setOutras] = useState(false);
  const [lista, setLista] = useState<{ titulo: string; linhas: LinhaDivergencia[] } | null>(null);
  const [mensagem, setMensagem] = useState('');
  const fechada = original?.status === 'Estoque Atualizado';
  const avisar = (texto: string) => { setLista(null); setMensagem(texto); };

  const adicionar = () => {
    const produto = produtoExemplo(Number(codigo.trim()));
    const qtd = lerNumero(quantidade);
    if (!produto) { avisar('Produto não encontrado.'); return; }
    if (qtd === undefined || qtd <= 0) { avisar('Informe a quantidade.'); return; }
    setItens((l) => (l.some((i) => i.produto === produto.codigo)
      ? l.map((i) => (i.produto === produto.codigo ? { ...i, quantidade: Math.round((i.quantidade + qtd) * 10000) / 10000 } : i))
      : [...l, { produto: produto.codigo, quantidade: qtd, data: hoje() }]));
    setCodigo('');
    setQuantidade('');
    setMensagem('');
  };
  const listar = (divergentes: boolean) => {
    setMensagem('');
    const linhas = divergencias({ empresa: Number(cab.empresa), tipoEstoque: Number(cab.tipoEstoque), data: cab.data, itens })
      .filter((i) => (i.diferenca !== 0) === divergentes);
    setLista({ titulo: divergentes ? 'Produtos divergentes' : 'Produtos não divergentes', linhas });
  };

  return (
    <>
      <div className="ficha-elevor">
        <Linha rotulo="Código:" id="contagem-codigo">
          <input id="contagem-codigo" className="campo curto" value={original?.codigo ?? ''} readOnly />
        </Linha>
        <Linha rotulo="Empresa:" id="contagem-empresa">
          <select id="contagem-empresa" className="campo cheio" value={cab.empresa} disabled={fechada} onChange={(e) => setCab((c) => ({ ...c, empresa: e.target.value }))}>
            {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Status:" id="contagem-status">
          <select id="contagem-status" className="campo medio" value={cab.status} disabled={fechada}
            onChange={(e) => setCab((c) => ({ ...c, status: e.target.value as StatusContagem }))}>
            {STATUS_CONTAGEM.map((s) => <option key={s}>{s}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Data:" id="contagem-data">
          <input id="contagem-data" type="date" className="campo" value={cab.data} disabled={fechada} onChange={(e) => setCab((c) => ({ ...c, data: e.target.value }))} />
        </Linha>
        <Linha rotulo="Tipo de Estoque:" id="contagem-tipo-estoque">
          <select id="contagem-tipo-estoque" className="campo medio" value={cab.tipoEstoque} disabled={fechada}
            onChange={(e) => setCab((c) => ({ ...c, tipoEstoque: e.target.value }))}>
            {Object.entries(TIPOS_ESTOQUE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Linha>
        {!fechada && (
          <form onSubmit={(e) => { e.preventDefault(); adicionar(); }}>
            <Linha rotulo="Cód/Cód.barras:" id="contagem-produto">
              <input id="contagem-produto" className="campo curto" list="contagem-produtos" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
              <datalist id="contagem-produtos">
                {PRODUTOS_EXEMPLO.map((p) => <option key={p.codigo} value={p.codigo}>{p.descricao}</option>)}
              </datalist>
              {produtoExemplo(Number(codigo.trim())) && <span className="muted">{produtoExemplo(Number(codigo.trim()))?.descricao}</span>}
            </Linha>
            <Linha rotulo="Quantidade:" id="contagem-quantidade">
              <input id="contagem-quantidade" className="campo curto num" inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
              <button className="btn" type="submit">Adicionar Produto</button>
            </Linha>
          </form>
        )}
        <table className="grade compacta">
          <thead><tr><th className="num">Cod</th><th>Produto</th><th className="num">Quantidade</th><th>Data</th>{!fechada && <th className="acoes-linha" />}</tr></thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.produto}>
                <td className="num">{i.produto}</td>
                <td>{produtoExemplo(i.produto)?.descricao}</td>
                <td className="num">{num(i.quantidade)}</td>
                <td>{data(i.data)}</td>
                {!fechada && (
                  <td className="acoes-linha">
                    <button type="button" className="link-botao" title="Tirar da contagem" aria-label={`Tirar ${i.produto} da contagem`}
                      onClick={() => setItens((l) => l.filter((x) => x.produto !== i.produto))}><DeleteOutlineIcon /></button>
                  </td>
                )}
              </tr>
            ))}
            {!itens.length && <tr><td colSpan={fechada ? 4 : 5} className="vazio">Nenhum produto na contagem.</td></tr>}
          </tbody>
        </table>
        {mensagem && <div className="mensagem">{mensagem}</div>}
        <div className="botoes">
          <button className="btn primario" type="button" disabled={fechada} onClick={() => avisar('Demonstração: nada foi gravado.')}>Gravar</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/estoques/contagens/nova')}>Novo</button>
          <button className="btn" type="button" disabled={!original || fechada} onClick={() => avisar('Demonstração: nada foi excluído.')}>Excluir</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/estoques/contagens')}>Consultar</button>
          <button className="btn" type="button" disabled={fechada || !itens.length}
            onClick={() => avisar('Demonstração: nada foi gravado. No ERP, cada diferença vira um acerto no Kardex e a contagem passa a "Estoque Atualizado".')}>
            Atualizar Estoque
          </button>
          <button className="btn" type="button" aria-expanded={outras} onClick={() => setOutras((o) => !o)}>Outras Operações</button>
        </div>
        {outras && (
          <div className="botoes">
            <button className="btn" type="button" onClick={() => listar(false)}>Listar não Divergentes</button>
            <button className="btn" type="button" onClick={() => listar(true)}>Listar Divergentes</button>
            <button className="btn" type="button" disabled title="A impressão chega com a gravação.">Imprimir</button>
          </div>
        )}
      </div>
      {lista && <div className="ficha-elevor"><TabelaDivergencias titulo={lista.titulo} linhas={lista.linhas} /></div>}
    </>
  );
}

export default function ErpContagemFichaPage() {
  const { codigo } = useParams();
  const navigate = useNavigate();
  const original = codigo === 'nova' ? null : contagemExemplo(codigo);
  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      {codigo !== 'nova' && !original ? (
        <div className="ficha-elevor">
          <div className="mensagem">Contagem não encontrada.</div>
          <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/estoques/contagens')}>Consultar</button></div>
        </div>
      ) : (
        // A chave recomeça a ficha ao trocar de contagem (ex.: "Novo" numa contagem aberta).
        <Ficha key={codigo} original={original} />
      )}
    </div>
  );
}
