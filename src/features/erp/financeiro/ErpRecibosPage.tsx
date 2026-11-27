import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import SearchIcon from '@mui/icons-material/Search';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import Paginacao from '../Paginacao';
import { Opcoes } from '../estoques/campos';
import { data, EMPRESAS, hoje, moeda } from '../estoques/estoquesExemplo';
import { PESSOAS_EXEMPLO } from '../pessoas/pessoasExemplo';
import { AVISO_TITULOS, nomeEmpresa } from './titulosExemplo';
import {
  filtrarRecibos, filtroRecibosPadrao, PESSOAS_RECIBOS, RECIBOS_EXEMPLO, SITUACOES_RECIBO, TIPOS_RECIBO, type FiltroRecibos, type ReciboExemplo,
} from './recibosExemplo';

// /erp/recibos: Consulta de Recibos (FN_Recibos do Elevor), como a do ERP do Samuel (web/src/erp/financeiro/Recibos.tsx):
// filtros e grade do Elevor, ▶ com os títulos e a conta do recibo, Excluir (no ERP exclui a baixa: os títulos voltam a ficar
// em aberto e o lançamento sai do banco; conciliado não exclui) e Imprimir. Emitir Recibo Avulso: recibo sem título nem banco
// (selo AV). Demonstração: Excluir e Gravar só avisam. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const linha = (rotulo: string, campo: ReactNode) => <div className="form-linha"><div className="form-rotulo">{rotulo}</div><div className="form-controle">{campo}</div></div>;

function ReciboAvulso({ onFechar, onGravado }: { onFechar: () => void; onGravado: (texto: string) => void }) {
  const [f, setF] = useState({ empresa: String(EMPRESAS[0].id), tipo: 'R', pessoa: '', nome: '', valor: '', referente: '', data: hoje(), cidade: '' });
  const [erro, setErro] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const gravar = () => {
    const valor = Number(f.valor.replace(/\./g, '').replace(',', '.'));
    const quem = f.pessoa || f.nome.trim();
    const problema = !quem ? 'Informe o cliente/fornecedor ou o nome.' : !(valor > 0) ? 'Informe o valor.' : !f.referente.trim() ? 'Informe a que se refere o recibo.' : '';
    if (problema) { setErro(problema); return; }
    const proximo = Math.max(...RECIBOS_EXEMPLO.map((r) => r.numero)) + 1;
    onGravado(`Demonstração: nada foi gravado. O ERP emitiria o recibo avulso ${proximo} (${f.tipo === 'R' ? 'Recebemos de' : 'Pagamos a'} ${quem}, ${moeda(valor)}) e abriria a impressão.`);
  };
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal recibo-avulso" role="dialog" aria-label="Emitir Recibo Avulso" onClick={(e) => e.stopPropagation()}>
        <h3>Emitir Recibo Avulso</h3>
        <div className="ra-form">
          {linha('Empresa:', <select className="campo cheio" aria-label="Empresa do recibo" value={f.empresa} onChange={set('empresa')}>{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select>)}
          {linha('Tipo:', <Opcoes nome="ra-tipo" valor={f.tipo} onChange={(v) => setF((x) => ({ ...x, tipo: v }))} opcoes={[{ valor: 'R', rotulo: 'Recebemos de' }, { valor: 'P', rotulo: 'Pagamos a' }]} />)}
          {linha('Cliente/Fornecedor:', (
            <select className="campo cheio" aria-label="Cliente/Fornecedor" value={f.pessoa} onChange={set('pessoa')}>
              <option value="" />{PESSOAS_EXEMPLO.map((p) => <option key={p.codigo} value={p.nome}>{p.codigo} - {p.nome}</option>)}
            </select>
          ))}
          {!f.pessoa && linha('Ou nome:', <input className="campo cheio" aria-label="Ou nome" value={f.nome} onChange={set('nome')} maxLength={150} placeholder="quem não está no cadastro" />)}
          {linha('Valor:', <input className="campo curto num" aria-label="Valor" inputMode="decimal" value={f.valor} onChange={set('valor')} />)}
          {linha('Referente a:', <input className="campo cheio" aria-label="Referente a" value={f.referente} onChange={set('referente')} maxLength={300} />)}
          {linha('Data:', <input type="date" className="campo curto" aria-label="Data" value={f.data} onChange={set('data')} />)}
          {linha('Cidade:', <input className="campo medio" aria-label="Cidade" value={f.cidade} onChange={set('cidade')} maxLength={80} placeholder="vazio = cidade da empresa" />)}
        </div>
        <p className="muted small">O recibo avulso não gera título nem lançamento no banco.</p>
        {erro && <div className="mensagem erro">{erro}</div>}
        <div className="botoes">
          <button type="button" className="btn primario" onClick={gravar}>Gravar</button>
          <button type="button" className="btn" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default function ErpRecibosPage() {
  useTituloPagina('Consulta de Recibos');
  const [f, setF] = useState<FiltroRecibos>(() => filtroRecibosPadrao());
  const [lista, setLista] = useState(() => filtrarRecibos(filtroRecibosPadrao()));
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const [mensagem, setMensagem] = useState('');
  const [avulso, setAvulso] = useState(false);
  const escolher = (k: keyof FiltroRecibos) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const abrir = (n: number) => setAbertos((a) => { const s = new Set(a); if (s.has(n)) s.delete(n); else s.add(n); return s; });
  const excluir = (r: ReciboExemplo) => setMensagem(r.avulso
    ? `Demonstração: nada foi excluído. No ERP, excluir o recibo avulso ${r.numero} só apaga o recibo (não há título nem banco).`
    : `Demonstração: nada foi excluído. No ERP, excluir o recibo ${r.numero} exclui a baixa: ${r.titulos.length > 1 ? 'os títulos voltam' : 'o título volta'} a ficar em aberto e o lançamento sai de ${r.conta}.`);

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_TITULOS}</div>
      <div className="recibos-topo">
        <button type="button" className="link-botao" onClick={() => setAvulso(true)} title="Recibo para quem recebeu ou pagou algo, sem título nem baixa (não lança no banco)">Emitir Recibo Avulso</button>
      </div>
      {avulso && <ReciboAvulso onFechar={() => setAvulso(false)} onGravado={(texto) => { setAvulso(false); setMensagem(texto); }} />}
      <form className="ficha-elevor largo recibos-filtros" onSubmit={(e) => { e.preventDefault(); setLista(filtrarRecibos(f)); setPagina(0); setMensagem(''); }}>
        {linha('Empresa:', (
          <select className="campo cheio" aria-label="Empresa" value={f.empresa} onChange={(e) => escolher('empresa')(e.target.value)}>
            <option value="" />{EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        ))}
        {linha('Cliente:', (
          <select className="campo cheio" aria-label="Cliente" value={f.pessoa} onChange={(e) => escolher('pessoa')(e.target.value)}>
            <option value="" />{PESSOAS_RECIBOS.map((p) => <option key={p}>{p}</option>)}
          </select>
        ))}
        {linha('Período:', (
          <>
            <input type="date" className="campo" aria-label="Período: de" value={f.de} onChange={(e) => escolher('de')(e.target.value)} /> a{' '}
            <input type="date" className="campo" aria-label="Período: até" value={f.ate} onChange={(e) => escolher('ate')(e.target.value)} />
          </>
        ))}
        {linha('Número Recibo:', <input className="campo mini" aria-label="Número Recibo" inputMode="numeric" value={f.numero} onChange={(e) => escolher('numero')(e.target.value)} />)}
        {linha('Número Título:', <input className="campo mini" aria-label="Número Título" value={f.titulo} onChange={(e) => escolher('titulo')(e.target.value)} />)}
        {linha('Tipo:', <Opcoes nome="tipo-recibo" valor={f.tipo} onChange={escolher('tipo')} opcoes={TIPOS_RECIBO} />)}
        {linha('Situação:', <Opcoes nome="situacao-recibo" valor={f.situacao} onChange={escolher('situacao')} opcoes={SITUACOES_RECIBO} />)}
        <div className="botoes"><button className="btn primario" type="submit"><SearchIcon /> Pesquisar</button></div>
      </form>
      {mensagem && <div className="mensagem">{mensagem}</div>}
      <table className="grade compacta recibos-elevor">
        <thead>
          <tr>
            <th className="seta" /><th /><th className="num">Numero</th><th>Data</th><th className="num">Cod</th><th>Cliente</th><th className="num">Valor</th><th className="num">Multa</th>
            <th className="num">Juros</th><th className="num">Desc</th><th className="num">Liquido</th><th>Usuário</th><th>Data Criação</th><th>Situação</th><th>Moti. Canc.</th>
            <th>Cancelar</th><th>Imprimir</th>
          </tr>
        </thead>
        <tbody>
          {lista.slice(pagina * porPagina, (pagina + 1) * porPagina).map((r) => (
            <Fragment key={r.numero}>
              <tr>
                <td className="seta">
                  <button type="button" className="link-botao" aria-expanded={abertos.has(r.numero)} aria-label="Títulos e conta do recibo" onClick={() => abrir(r.numero)}>{abertos.has(r.numero) ? '▼' : '▶'}</button>
                </td>
                <td>{r.avulso
                  ? <span className={`selo-tipo avulso ${r.tipo === 'R' ? 'receber' : 'pagar'}`} title={`Avulso · ${r.tipo === 'R' ? 'Recebemos de' : 'Pagamos a'}`}>AV</span>
                  : <span className={`selo-tipo ${r.tipo === 'R' ? 'receber' : 'pagar'}`} title={`${r.tipo === 'R' ? 'Receber' : 'Pagar'}${r.adiantamento ? ' · Crédito/Adiantamento' : ''}`}>{r.tipo}</span>}</td>
                <td className="num"><Link className="linha-link" to={`/erp/recibos/${r.numero}`}>{r.numero}</Link></td>
                <td>{data(r.data)}</td><td className="num">{r.pessoaCodigo ?? ''}</td><td>{r.pessoa}</td>
                <td className="num">{moeda(r.principal)}</td><td className="num">{moeda(r.multa)}</td><td className="num">{moeda(r.juros)}</td>
                <td className="num">{moeda(r.desconto)}</td><td className="num">{moeda(r.valor)}</td>
                <td>{r.usuario}</td><td className="small">{data(r.criadoEm.slice(0, 10))} {r.criadoEm.slice(11)}</td><td>Normal</td><td />
                <td>{r.conciliado
                  ? <span className="etiqueta ok" title="Conciliado: para excluir, desfaça a conciliação">conciliado</span>
                  : <button type="button" className="link-botao" onClick={() => excluir(r)} title="No ERP o recibo não fica cancelado: a baixa é excluída (Exclusão de Baixas)">Excluir</button>}</td>
                <td><Link className="link-botao" to={`/erp/recibos/${r.numero}`}>Imprimir</Link></td>
              </tr>
              {abertos.has(r.numero) && (
                <tr className="linha-detalhe">
                  <td /><td colSpan={16}>
                    {r.avulso
                      ? <>Avulso ({r.tipo === 'R' ? 'Recebemos de' : 'Pagamos a'}) · sem título e sem lançamento no banco · Empresa: {nomeEmpresa(r.empresa)} · Referente a: {r.referente}</>
                      : <>
                        Títulos: {r.titulos.map((t, i) => (
                          <Fragment key={t.id}>{i > 0 && ', '}<Link className="linha-link" to={`/erp/titulos/${t.id}`}>{t.numero}/{t.sequencia}</Link></Fragment>
                        ))} · Conta: {r.conta} · Empresa: {nomeEmpresa(r.empresa)} · {r.historico}
                      </>}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!lista.length && <tr><td colSpan={17} className="vazio">Nenhum recibo.</td></tr>}
        </tbody>
      </table>
      <Paginacao total={lista.length} pagina={pagina} porPagina={porPagina} onPagina={setPagina} onPorPagina={(n) => { setPorPagina(n); setPagina(0); }} />
    </div>
  );
}
