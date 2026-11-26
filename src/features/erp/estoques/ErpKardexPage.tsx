import { Fragment, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import { Linha, Opcoes } from './campos';
import {
  AVISO_ESTOQUES, data, EMPRESAS, largura, GRUPOS, MARCAS, moeda, MOVIMENTOS, nomeEmpresa, num, PRODUTOS_EXEMPLO, produtoExemplo, TIPOS_ESTOQUE,
  type Movimento, type TipoMovimento,
} from './estoquesExemplo';

// /erp/estoques/kardex: Kardex na disposição da RL_Kardex do Elevor (Empresa, Grupo, Produto, Marca, Período, Tipo Estoque
// e Tipo). "Gerar" mostra o extrato embaixo, como o ERP do Samuel: por produto e empresa, do mais antigo ao mais novo,
// com o saldo e o custo médio depois de cada movimento. Sem produto, lista todos os do grupo/marca, um bloco por produto.
// Aberto pela Conferência de Estoques com ?produto=&empresa=. Demonstração: movimentos de exemplo.

const PADRAO = { empresa: '', grupo: '', produto: '', marca: '', de: '', ate: '', tipoEstoque: '1', tipo: '' as '' | TipoMovimento };
type Filtros = typeof PADRAO;
const MOVIMENTO: Record<TipoMovimento, string> = { entrada: 'Entrada', saida: 'Saída', acerto: 'Acerto' };

function filtrar(f: Filtros): Movimento[] {
  const produtos = new Set(PRODUTOS_EXEMPLO.filter((p) => (!f.produto || p.codigo === Number(f.produto)) && (!f.grupo || p.grupo === f.grupo)
    && (!f.marca || p.marca === f.marca)).map((p) => p.codigo));
  return MOVIMENTOS.filter((m) => produtos.has(m.produto) && (!f.empresa || m.empresa === Number(f.empresa)) && m.tipoEstoque === Number(f.tipoEstoque)
    && (!f.de || m.data >= f.de) && (!f.ate || m.data <= f.ate) && (!f.tipo || m.tipo === f.tipo))
    .sort((a, b) => a.produto - b.produto || a.empresa - b.empresa || a.seq - b.seq);
}

// Saldo do produto antes do período (último movimento anterior à data inicial).
function saldoAnterior(m: Movimento, de: string) {
  let saldo = 0;
  for (const x of MOVIMENTOS) {
    if (x.empresa === m.empresa && x.tipoEstoque === m.tipoEstoque && x.produto === m.produto && x.data < de) saldo = x.saldoApos;
  }
  return saldo;
}

export default function ErpKardexPage() {
  const [params] = useSearchParams();
  const inicial: Filtros = { ...PADRAO, produto: params.get('produto') ?? '', empresa: params.get('empresa') ?? '' };
  const [form, setForm] = useState<Filtros>(inicial);
  // Vindo da Conferência (com produto), já mostra o extrato; senão espera o "Gerar".
  const [aplicado, setAplicado] = useState<Filtros | null>(inicial.produto ? inicial : null);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const muda = <K extends keyof Filtros>(chave: K, valor: Filtros[K]) => setForm((f) => ({ ...f, [chave]: valor }));
  const campo = (chave: Exclude<keyof Filtros, 'tipo'>) => ({ value: form[chave], onChange: (e: { target: { value: string } }) => muda(chave, e.target.value) });

  const produtos = PRODUTOS_EXEMPLO.filter((p) => (!form.grupo || p.grupo === form.grupo) && (!form.marca || p.marca === form.marca));
  const linhas = useMemo(() => (aplicado ? filtrar(aplicado) : []), [aplicado]);
  let blocoAnterior = '';

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      <form className="relatorio-elevor" onSubmit={(e) => { e.preventDefault(); setAplicado(form); setPagina(0); }}>
        <Linha rotulo="Empresa:" id="kardex-empresa">
          <select id="kardex-empresa" className="campo" style={largura(300)} {...campo('empresa')}>
            <option value="">Todas</option>
            {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Grupo:" id="kardex-grupo">
          <select id="kardex-grupo" className="campo" style={largura(448)} value={form.grupo}
            onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value, produto: '' }))}>
            <option value="" />{GRUPOS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Produto:" id="kardex-produto">
          <select id="kardex-produto" className="campo" style={largura(448)} {...campo('produto')}>
            <option value="">Todos</option>
            {produtos.map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.descricao}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Marca:" id="kardex-marca">
          <select id="kardex-marca" className="campo" style={largura(208)} value={form.marca}
            onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value, produto: '' }))}>
            <option value="" />{MARCAS.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Período:" id="kardex-de">
          <input id="kardex-de" type="date" className="campo" {...campo('de')} /> a <input type="date" className="campo" aria-label="Período: até" {...campo('ate')} />
        </Linha>
        <Linha rotulo="Tipo Estoque:" id="kardex-tipo-estoque">
          <select id="kardex-tipo-estoque" className="campo curto" {...campo('tipoEstoque')}>
            {Object.entries(TIPOS_ESTOQUE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Tipo:">
          <Opcoes nome="tipo" valor={form.tipo} onChange={(v) => muda('tipo', v)}
            opcoes={[{ valor: '', rotulo: 'Todas' }, { valor: 'entrada', rotulo: 'Entradas' }, { valor: 'saida', rotulo: 'Saídas' }, { valor: 'acerto', rotulo: 'Acertos' }]} />
        </Linha>
        <div className="botoes">
          <button className="btn primario" type="submit"><SearchIcon /> Gerar</button>
        </div>
      </form>

      {!aplicado ? <div className="mensagem">Escolha os filtros e clique em Gerar.</div> : (
        <>
          <div className="resumo-linha"><span><b>{linhas.length.toLocaleString('pt-BR')}</b> movimentos</span></div>
          <table className="grade compacta">
            <thead>
              <tr>
                <th>Data</th><th>Estoque</th><th>Movimento</th><th className="num">Quantidade</th><th className="num">Saldo após</th>
                <th className="num">Custo Médio</th><th>Origem</th><th>Pessoa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.slice(pagina * porPagina, (pagina + 1) * porPagina).map((m) => {
                const bloco = `${m.produto}|${m.empresa}`;
                const novo = bloco !== blocoAnterior;
                blocoAnterior = bloco;
                const p = produtoExemplo(m.produto)!;
                return (
                  <Fragment key={m.seq}>
                    {novo && <tr className="linha-quebra"><td colSpan={8}>{p.codigo} - {p.descricao} ({p.unidade}) · {nomeEmpresa(m.empresa)}</td></tr>}
                    {novo && aplicado.de && (
                      <tr><td colSpan={4} className="muted">Saldo anterior a {data(aplicado.de)}</td><td className="num">{num(saldoAnterior(m, aplicado.de))}</td><td colSpan={3} /></tr>
                    )}
                    <tr>
                      <td>{data(m.data)}</td>
                      <td>{TIPOS_ESTOQUE[m.tipoEstoque]}</td>
                      <td>{MOVIMENTO[m.tipo]}</td>
                      <td className="num">{m.tipo === 'saida' ? '−' : m.tipo === 'entrada' ? '+' : ''}{num(m.quantidade)}</td>
                      <td className={`num${m.saldoApos < 0 ? ' negativo' : ''}`}>{num(m.saldoApos)}</td>
                      <td className="num">{moeda(m.custoMedioApos)}</td>
                      {/* A nota abre o detalhe (Notas, 2026-11-26). */}
                      <td>{/^Nota \d+/.test(m.origem) ? <Link className="linha-link" to={`/erp/notas/${m.origem.match(/^Nota (\d+)/)![1]}`}>{m.origem}</Link> : m.origem}</td>
                      <td>{m.pessoa}</td>
                    </tr>
                  </Fragment>
                );
              })}
              {!linhas.length && <tr><td colSpan={8} className="vazio">Nenhum movimento no filtro.</td></tr>}
            </tbody>
          </table>
          <Paginacao total={linhas.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina}
            onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
        </>
      )}
    </div>
  );
}
