import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { Linha } from './campos';
import { AVISO_ESTOQUES, data, largura, moeda, num } from './estoquesExemplo';
import { opcoesDoFiltro, padraoDoFiltro, relatorioEstoque, type ColunaRel, type FiltroRel, type LinhaRel, type RelatorioDef, type Valores } from './relatoriosEstoque';

// /erp/estoques/relatorios/:relatorio: os relatórios de Estoques (Relação de Acertos, Posição de Estoque, Giro, Produtos sem
// Giro, Curva ABC e Relação de Notas) na tela de relatório do ERP do Samuel (web/src/erp/relatorios/Relatorio.tsx): filtros na disposição do
// Elevor, "Mais Opções" com os escondidos, "Gerar" com a setinha para Exportar CSV e Imprimir, e a grade com subtotal por
// quebra e o total. Demonstração: a conta roda sobre os dados de exemplo (relatoriosEstoque.ts).

const formatar = (c: ColunaRel, v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === '') return '';
  switch (c.tipo) {
    case 'moeda': return moeda(Number(v));
    case 'decimal': return num(Number(v));
    case 'percentual': return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
    case 'data': return data(String(v));
    default: return String(v);
  }
};
const numerica = (c: ColunaRel) => ['moeda', 'decimal', 'inteiro', 'percentual'].includes(c.tipo ?? '');
const somar = (linhas: LinhaRel[], colunas: ColunaRel[]) =>
  Object.fromEntries(colunas.filter((c) => c.total).map((c) => [c.nome, Math.round(linhas.reduce((t, l) => t + Number(l[c.nome] ?? 0), 0) * 100) / 100]));

/** Baixa a grade em CSV (separado por ponto e vírgula, para abrir no Excel em português). */
function baixarCsv(def: RelatorioDef, colunas: ColunaRel[], linhas: LinhaRel[]) {
  const celula = (t: string) => (/[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  const corpo = [colunas.map((c) => celula(c.rotulo)).join(';'), ...linhas.map((l) => colunas.map((c) => celula(formatar(c, l[c.nome]))).join(';'))].join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', corpo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${def.titulo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Relatorio({ def }: { def: RelatorioDef }) {
  useTituloPagina(def.titulo);
  const inicial = useMemo(() => Object.fromEntries(def.filtros.map((f) => [f.nome, padraoDoFiltro(f)])) as Valores, [def]);
  const [valores, setValores] = useState<Valores>(inicial);
  const [aplicado, setAplicado] = useState<Valores | null>(null);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [menuGerar, setMenuGerar] = useState(false);
  const mudar = (nome: string, v: string) => setValores((x) => ({ ...x, [nome]: v }));

  const linhas = useMemo(() => (aplicado ? def.gerar(aplicado) : null), [aplicado, def]);
  const quebra = typeof def.quebra === 'function' ? (aplicado ? def.quebra(aplicado) : undefined) : def.quebra;
  const colunas = def.colunas.filter((c) => (!c.soSe || (aplicado && c.soSe(aplicado))) && c.nome !== quebra);
  const grupos = useMemo(() => {
    if (!linhas || !quebra) return null;
    const mapa = new Map<string, LinhaRel[]>();
    for (const l of linhas) { const k = String(l[quebra] ?? ''); mapa.set(k, [...(mapa.get(k) ?? []), l]); }
    return [...mapa.entries()];
  }, [linhas, quebra]);

  const controle = (f: FiltroRel): ReactNode => {
    const v = valores[f.nome] ?? '';
    const estilo = f.largura ? largura(f.largura) : undefined;
    const rotulo = f.rotulo || 'Opção';
    switch (f.tipo) {
      case 'data':
        return <input type="date" className="campo" aria-label={f.rotulo === 'a' ? 'Período: até' : f.rotulo} value={v} disabled={f.desabilitado} onChange={(e) => mudar(f.nome, e.target.value)} />;
      case 'caixa':
        return <input type="checkbox" aria-label={rotulo} checked={v === 'true'} disabled={f.desabilitado} onChange={(e) => mudar(f.nome, e.target.checked ? 'true' : '')} />;
      case 'texto': case 'inteiro':
        return <input className="campo" style={estilo} aria-label={rotulo} inputMode={f.tipo === 'inteiro' ? 'numeric' : undefined} value={v} disabled={f.desabilitado} onChange={(e) => mudar(f.nome, e.target.value)} />;
      case 'opcoes':
        if ((f.opcoes?.length ?? 0) <= 5 && !f.largura) {
          return (
            <div className="opcoes" role="radiogroup" aria-label={rotulo}>
              {(f.obrigatorio ? f.opcoes! : [{ valor: '', rotulo: 'Todos' }, ...f.opcoes!]).map((o) => (
                <label key={o.valor} className="opcao">
                  <input type="radio" name={`${def.id}-${f.nome}`} checked={v === o.valor} disabled={f.desabilitado} onChange={() => mudar(f.nome, o.valor)} /> {o.rotulo}
                </label>
              ))}
            </div>
          );
        }
        break;
      default:
        break;
    }
    const opcoes = opcoesDoFiltro(f);
    return (
      <select className="campo" style={estilo ?? largura(448)} aria-label={rotulo} value={v} disabled={f.desabilitado} onChange={(e) => mudar(f.nome, e.target.value)}>
        {!f.obrigatorio && <option value="">{f.tipo === 'empresa' ? 'Todas' : ''}</option>}
        {opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
      </select>
    );
  };
  const extras = (f: FiltroRel) => f.ajuda && <span className="fc-ajuda rel-ajuda-campo" title={f.ajuda}><HelpOutlineIcon /></span>;

  // Uma linha por filtro; o "par" (data final) vai na mesma linha, depois de "a".
  const pares = new Set(def.filtros.map((f) => f.par).filter(Boolean));
  const linhaDoFiltro = (f: FiltroRel) => {
    const par = f.par ? def.filtros.find((x) => x.nome === f.par) : undefined;
    return (
      <Linha key={f.nome} rotulo={f.rotulo ? `${f.rotulo}:` : ''}>
        {controle(f)}{extras(f)}
        {par && <> {par.rotulo} {controle(par)}</>}
      </Linha>
    );
  };
  const visiveis = def.filtros.filter((f) => !f.mais && !pares.has(f.nome));
  const escondidos = def.filtros.filter((f) => f.mais && !pares.has(f.nome));

  const linhaTotal = (rotulo: string, totais: Record<string, number>) => (
    <tr className="linha-total">
      {colunas.map((c, i) => <td key={c.nome} className={c.total && numerica(c) ? 'num' : undefined}>{c.total ? formatar(c, totais[c.nome]) : i === 0 ? rotulo : ''}</td>)}
    </tr>
  );
  const linhaDados = (l: LinhaRel, n: number) => (
    <tr key={n}>
      {colunas.map((c) => {
        const t = formatar(c, l[c.nome]);
        return <td key={c.nome} className={numerica(c) ? 'num' : undefined}>{c.link && t ? <Link className="linha-link" to={c.link(l)}>{t}</Link> : t}</td>;
      })}
    </tr>
  );

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      <form className="relatorio-elevor" onSubmit={(e) => { e.preventDefault(); setAplicado(valores); setMenuGerar(false); }}>
        {visiveis.map(linhaDoFiltro)}
        {escondidos.length > 0 && (
          <>
            <button type="button" className="link-botao mais-opcoes" aria-expanded={maisOpcoes} onClick={() => setMaisOpcoes((m) => !m)}>
              Mais Opções {maisOpcoes ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </button>
            {maisOpcoes && escondidos.map(linhaDoFiltro)}
          </>
        )}
        <div className="botoes">
          {/* "Gerar" com a setinha ao lado, como no Elevor: a setinha abre as outras saídas. */}
          <div className="btn-dividido">
            <button className="btn primario" type="submit"><FileDownloadOutlinedIcon /> Gerar</button>
            <button className="btn primario seta" type="button" aria-label="Outras saídas" aria-expanded={menuGerar} onClick={() => setMenuGerar((m) => !m)}><ExpandMoreIcon /></button>
            {menuGerar && (
              <div className="menu-gerar" onMouseLeave={() => setMenuGerar(false)}>
                <button type="button" disabled={!linhas} onClick={() => { setMenuGerar(false); if (linhas) baixarCsv(def, colunas, linhas); }}><DownloadIcon /> Exportar CSV</button>
                <button type="button" disabled={!linhas} onClick={() => { setMenuGerar(false); window.print(); }}><PrintOutlinedIcon /> Imprimir</button>
              </div>
            )}
          </div>
          <span className="fc-ajuda" title={def.ajuda}><HelpOutlineIcon /></span>
        </div>
      </form>

      {linhas && (
        <table className="grade compacta relatorio">
          <thead><tr>{colunas.map((c) => <th key={c.nome} className={numerica(c) ? 'num' : undefined}>{c.rotulo}</th>)}</tr></thead>
          <tbody>
            {!linhas.length && <tr><td colSpan={colunas.length} className="vazio">Nada encontrado com esses filtros.</td></tr>}
            {grupos ? grupos.map(([grupo, doGrupo]) => (
              <Fragment key={grupo}>
                <tr className="linha-quebra"><td colSpan={colunas.length}>{grupo || '(sem)'}</td></tr>
                {doGrupo.map(linhaDados)}
                {colunas.some((c) => c.total) && linhaTotal(`Subtotal (${doGrupo.length})`, somar(doGrupo, colunas))}
              </Fragment>
            )) : linhas.map(linhaDados)}
            {linhas.length > 0 && colunas.some((c) => c.total) && linhaTotal(`Total (${linhas.length})`, somar(linhas, colunas))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function ErpRelatorioEstoquePage() {
  const { relatorio } = useParams();
  const navigate = useNavigate();
  const def = relatorioEstoque(relatorio);
  if (!def) {
    return (
      <div className="erp-elevor">
        <div className="mensagem">Relatório não encontrado.</div>
        <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/estoques')}>Conferência de Estoques</button></div>
      </div>
    );
  }
  // key: trocar de relatório recomeça os filtros.
  return <Relatorio key={def.id} def={def} />;
}
