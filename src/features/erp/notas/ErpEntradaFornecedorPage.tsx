import { Fragment, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { data, EMPRESAS, hoje, lerNumero, moeda, num, produtoExemplo, PRODUTOS_EXEMPLO } from '../estoques/estoquesExemplo';
import { lerNfe, type Nfe } from './nfeXml';
import {
  AVISO_NOTAS, BANCOS, CENTROS_CUSTO, fornecedorDoEmitente, nfeDeExemplo, NATUREZAS, NOTAS_EXEMPLO, PLANOS_CONTAS, produtoDoItem, TIPOS_DOCUMENTO,
} from './notasExemplo';

// /erp/notas/entrada: Entrada de Fornecedor na disposição da CD_EntradaFornecedor do Elevor, como o ERP do Samuel a fez
// (web/src/erp/fiscal/EntradaFornecedor.tsx): abas Nota, Produtos, Impostos, Forma Pagamento e Transportador. "Importar
// XML" lê a NF-e no navegador (nfeXml.ts; o arquivo não sai da máquina) e "Nota de exemplo" carrega uma compra fictícia.
// Cada item é ligado a um produto do ERP, com o fator da unidade. Demonstração: Gravar só diz o que o ERP faria (entrada
// no estoque e títulos a pagar). The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

type Lig = { produto: string; fator: string };
const ABAS = [
  { id: 'nota', rotulo: 'Nota' }, { id: 'produtos', rotulo: 'Produtos' }, { id: 'impostos', rotulo: 'Impostos' },
  { id: 'pagamento', rotulo: 'Forma Pagamento' }, { id: 'transportador', rotulo: 'Transportador' },
] as const;
type Aba = (typeof ABAS)[number]['id'];
const MOD_FRETE: Record<string, string> = {
  0: 'Contratação do Frete por conta do Remetente (CIF)', 1: 'Contratação do Frete por conta do Destinatário (FOB)',
  2: 'Contratação do Frete por conta de Terceiros', 3: 'Transporte Próprio por conta do Remetente',
  4: 'Transporte Próprio por conta do Destinatário', 9: 'Sem Ocorrência de Transporte',
};
const FORMULARIO = {
  empresa: '', natureza: '', dataEntrada: hoje(), atualizarEstoque: true, gerarFinanceiro: true, plano: '', centro: '', tipoDocumento: '',
  vencimento: '', descontoIcms: false, freteIcms: false, banco: '', descontoPontualidade: '', observacao: '', mensagemAdicional: '',
  mensagemIcms: '', referenciarCtes: false,
};
const limpa = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

export default function ErpEntradaFornecedorPage() {
  useTituloPagina('Entrada de Fornecedor');
  const [aba, setAba] = useState<Aba>('nota');
  const [nfe, setNfe] = useState<Nfe | null>(null);
  const [lig, setLig] = useState<Record<number, Lig>>({});
  const [f, setF] = useState(FORMULARIO);
  const [aviso, setAviso] = useState('');
  const [erro, setErro] = useState('');
  const [itemSel, setItemSel] = useState<number | null>(null);
  const [maisOpcoes, setMaisOpcoes] = useState(false);
  const [forma, setForma] = useState('prazo');
  const semAcao = (b: string) => setAviso(`"${b}" ainda não funciona no ERP.`);

  const fornecedor = nfe ? fornecedorDoEmitente(nfe.emitente.documento, nfe.emitente.nome) : null;
  const existente = nfe && fornecedor ? NOTAS_EXEMPLO.find((n) => n.numero === nfe.numero && n.tipo === 'E' && limpa(n.pessoa) === limpa(fornecedor.nome)) : undefined;

  const carregarNfe = (n: Nfe) => {
    setNfe(n); setErro(''); setAviso(''); setItemSel(null);
    setLig(Object.fromEntries(n.itens.map((i) => {
      const p = produtoDoItem(i);
      const fator = p && i.unidade && limpa(i.unidade) !== p.unidade && limpa(i.unidade) === p.unidadeCompra ? p.quantidadeCompra : 1;
      return [i.item, { produto: p ? String(p.codigo) : '', fator: String(fator).replace('.', ',') }];
    })));
    const empresa = EMPRESAS.find((e) => n.destinatario.nome && limpa(e.nome) === limpa(n.destinatario.nome));
    setF({ ...FORMULARIO, empresa: empresa ? String(empresa.id) : '', natureza: '1', observacao: n.informacoes ?? '', mensagemAdicional: n.informacoesFisco ?? '' });
  };
  const importar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    try { carregarNfe(lerNfe(await arquivo.text())); } catch (e) { setNfe(null); setErro((e as Error).message); }
  };
  const novo = () => { setNfe(null); setLig({}); setF(FORMULARIO); setAba('nota'); setAviso(''); setErro(''); };

  const faltam = nfe ? nfe.itens.filter((i) => !lig[i.item]?.produto).length : 0;
  const gravar = () => {
    if (!nfe) return;
    if (!f.empresa) return setErro('Escolha a empresa.');
    if (!f.natureza) return setErro('Escolha a natureza de operação.');
    if (faltam) { setAba('produtos'); return setErro(`${faltam} item(ns) sem produto ligado (aba Produtos).`); }
    setErro('');
    const parcelas = nfe.duplicatas.length || 1;
    setAviso(`Demonstração: nada foi gravado. Ao gravar, o ERP lançaria a nota ${nfe.numero}${fornecedor ? '' : `, cadastraria o fornecedor ${nfe.emitente.nome}`}`
      + `${f.atualizarEstoque ? `, daria entrada de ${nfe.itens.length} produto(s) no estoque da ${EMPRESAS.find((e) => String(e.id) === f.empresa)?.nome}` : ''}`
      + `${f.gerarFinanceiro ? ` e geraria ${parcelas} título(s) a pagar, ${moeda(nfe.totais.total)}` : ''}.`);
  };

  const t = nfe?.totais;
  const so = (v: unknown, classe = 'campo medio') => <input className={classe} value={v === null || v === undefined ? '' : String(v)} readOnly tabIndex={-1} />;
  const valor = (v: number | undefined) => so(nfe && v !== undefined ? moeda(v) : '', 'campo curto num ef-valor');
  const marca = (k: 'descontoIcms' | 'freteIcms' | 'referenciarCtes', rotulo: string) => (
    <label className="opcao"><input type="checkbox" checked={f[k]} disabled={!nfe} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.checked }))} /> {rotulo}</label>
  );
  const texto = (k: 'observacao' | 'mensagemAdicional' | 'mensagemIcms', rotulo: string) => (
    <textarea className="campo area ef-mensagem" rows={3} aria-label={rotulo} value={f[k]} disabled={!nfe} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
  );
  const lista = (k: 'plano' | 'centro' | 'tipoDocumento' | 'banco', opcoes: string[], rotulo: string) => (
    <select className="campo medio" aria-label={rotulo} value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}>
      <option value="" />{opcoes.map((o) => <option key={o}>{o}</option>)}
    </select>
  );
  const linha = (r1: string, c1: ReactNode, r2?: string, c2?: ReactNode) => (
    <div className={`form-linha${r2 !== undefined ? ' dupla' : ''}`}>
      <div className="form-rotulo">{r1}</div><div className="form-controle">{c1}</div>
      {r2 !== undefined && <><div className="form-rotulo">{r2}</div><div className="form-controle">{c2}</div></>}
    </div>
  );
  const importe = <p className="muted">Importe o XML ou carregue a nota de exemplo na aba Nota.</p>;

  return (
    <div className="erp-elevor ficha-entrada">
      <div className="erp-aviso">{AVISO_NOTAS}</div>
      <div className="abas" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`aba${aba === a.id ? ' ativa' : ''}`} onClick={() => setAba(a.id)}>{a.rotulo}</button>
        ))}
      </div>
      {erro && <div className="mensagem erro">{erro}</div>}
      {aviso && <div className="mensagem">{aviso}</div>}
      {existente && <div className="mensagem erro">Esta nota já foi lançada: <Link to={`/erp/notas/${existente.numero}`}>abrir a nota {existente.numero}</Link>.</div>}

      {aba === 'nota' && (
        <div className="entrada-nota">
          {linha('', <>
            <label className="btn primario"><FileUploadOutlinedIcon /> Importar XML
              <input type="file" accept=".xml,.XML" hidden onChange={(e) => { importar(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button type="button" className="btn primario" onClick={() => semAcao('NFes Destinadas (Sefaz)')}>NFes Destinadas (Sefaz)</button>
            <button type="button" className="btn" onClick={() => carregarNfe(nfeDeExemplo(hoje()))}>Nota de exemplo</button>
          </>)}
          {linha('ID NF-e:', <>{so(nfe?.chave, 'campo medio ef-chave')}<button type="button" className="btn" onClick={() => semAcao('Buscar XML NFe')}>Buscar XML NFe</button></>)}
          {linha('Empresa:', (
            <select className="campo medio" aria-label="Empresa" value={f.empresa} disabled={!nfe} onChange={(e) => setF((x) => ({ ...x, empresa: e.target.value }))}>
              <option value="">{nfe && !f.empresa ? 'O destinatário não é de nenhuma empresa: escolha' : ''}</option>
              {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          ))}
          {linha('Fornecedor:', <>
            {so(fornecedor?.codigo ?? '', 'campo mini')}{so(nfe?.emitente.nome)}
            {nfe && (fornecedor
              ? <Link className="etiqueta ok" to={`/erp/pessoas/${fornecedor.codigo}`}>cadastrado</Link>
              : <span className="etiqueta">será cadastrado ao gravar</span>)}
          </>)}
          {linha('Cidade:', <>{so(nfe?.emitente.municipio)}{so(nfe?.emitente.uf, 'campo mini')}</>)}
          {linha('Natureza Operação:', <>
            {so(f.natureza, 'campo mini')}
            <select className="campo medio" aria-label="Natureza Operação" value={f.natureza} disabled={!nfe} onChange={(e) => setF((x) => ({ ...x, natureza: e.target.value }))}>
              <option value="" />{NATUREZAS.filter((n) => n.tipo === 'E').map((n) => <option key={n.codigo} value={n.codigo}>{n.descricao}</option>)}
            </select>
            {nfe?.natureza && <span className="muted small">no XML: {nfe.natureza}</span>}
          </>)}
          {linha('Data Entrada:', <input type="date" className="campo curto" aria-label="Data Entrada" value={f.dataEntrada} disabled={!nfe}
            onChange={(e) => setF((x) => ({ ...x, dataEntrada: e.target.value }))} />, 'Data Emissão Original:', so(nfe ? data(nfe.emissao) : '', 'campo curto'))}
          {linha('Emissão Própria:', <input type="checkbox" aria-label="Emissão Própria" checked={false} disabled title="Entrada de nota do fornecedor (emissão própria não é feita pelo ERP)" />)}
          {linha('Número Nota:', so(nfe?.numero, 'campo curto ef-numero'), 'Espécie:', so(nfe ? 'NF' : '', 'campo mini ef-especie'))}
          {linha('Série:', so(nfe?.serie, 'campo mini'), 'Modelo:', so(nfe ? `${nfe.modelo} - Nota Fiscal Eletrônica (NF-e)` : '', 'campo medio ef-modelo'))}
          {linha('Valor Produtos:', valor(t?.produtos), 'Valor Nota:', valor(t?.total))}
          {linha('Valor Desconto:', <>{valor(t?.desconto)}{marca('descontoIcms', 'ICMS')}</>, 'Frete:', <>{valor(t?.frete)}{marca('freteIcms', 'ICMS')}</>)}
          {linha('Despesas Acessórias:', valor(t?.outros), 'Bancos:', lista('banco', BANCOS, 'Bancos'))}
          {linha('Seguro:', valor(t?.seguro), 'Plano Contas:', lista('plano', PLANOS_CONTAS, 'Plano Contas'))}
          {linha('Centros de Custo:', lista('centro', CENTROS_CUSTO, 'Centros de Custo'))}
          {linha('Funcionário:', <select className="campo medio" aria-label="Funcionário" disabled title="O ERP não tem cadastro de funcionários (dados de RH ficam fora)"><option /></select>,
            'Desconto Pontualidade%:', <input className="campo curto num ef-valor" aria-label="Desconto Pontualidade%" value={f.descontoPontualidade} disabled={!nfe}
              onChange={(e) => setF((x) => ({ ...x, descontoPontualidade: e.target.value }))} />)}
          {linha('Mensagem:', texto('observacao', 'Mensagem'))}
          {linha('Mensagem Adicional:', texto('mensagemAdicional', 'Mensagem Adicional'))}
          {linha('Mensagem ICMS:', texto('mensagemIcms', 'Mensagem ICMS'))}
          <div className="secao-titulo">Arquivos</div>
          <p className="muted small">Na demonstração não se anexam arquivos; no ERP, o XML e o PDF ficam com a nota.</p>
          {linha('Referenciar CTEs', marca('referenciarCtes', ''))}
          {linha('', <label className="opcao"><input type="checkbox" checked={f.atualizarEstoque} onChange={(e) => setF((x) => ({ ...x, atualizarEstoque: e.target.checked }))} />
            Dar entrada no estoque (custo = valor do item − desconto + IPI + ST + parte do frete)</label>)}
          {linha('', <label className="opcao"><input type="checkbox" checked={f.gerarFinanceiro} onChange={(e) => setF((x) => ({ ...x, gerarFinanceiro: e.target.checked }))} />
            Gerar títulos a pagar (aba Forma Pagamento)</label>)}
          {linha('', <label className="opcao" title="Ainda não existe no ERP"><input type="checkbox" disabled /> Redirecionar para a impressão de etiquetas</label>)}
          {linha('', <label className="opcao" title="Ainda não existe no ERP"><input type="checkbox" disabled /> Redirecionar para o gerador de preços após gravação</label>)}
        </div>
      )}

      {aba === 'produtos' && (!nfe ? importe : (
        <div className="entrada-produtos">
          {(() => {
            // Linha do item como a do Elevor: mostra o item escolhido na grade (os itens vêm do XML).
            const i = nfe.itens.find((x) => x.item === itemSel) ?? nfe.itens[0];
            const c = (r: string, v: unknown, classe = 'campo curto num') => (
              <label className="item-campo"><span>{r}</span><input className={classe} value={v === null || v === undefined ? '' : String(v)} readOnly tabIndex={-1} /></label>
            );
            const n2 = (v: number) => (v ? moeda(v) : '0,00');
            return (
              <div className="item-entrada">
                <div className="item-linha">
                  {c('Código', i.codigo, 'campo curto')}{c('Descrição', i.descricao, 'campo medio descricao')}{c('CFOP', i.cfop, 'campo mini')}
                  {c('Quantidade', num(i.quantidade))}{c('Valor Uni.', moeda(i.valorUnitario))}{c('Valor Total', moeda(i.valorTotal))}
                </div>
                <div className="item-linha">
                  {c('CST', i.cst, 'campo mini')}{c('B.ICMS', n2(i.baseIcms))}{c('%ICMS', num(i.aliqIcms), 'campo mini num')}{c('V.ICMS', n2(i.icms))}
                  {c('%IPI', num(i.aliqIpi), 'campo mini num')}{c('V.IPI', n2(i.ipi))}{c('BC.ST', n2(i.baseSt))}{c('%ST', num(i.aliqSt), 'campo mini num')}
                  {c('V.ST', n2(i.icmsSt))}{c('Isentas', '0,00')}{c('Outras', '0,00')}
                  <button type="button" className="btn primario" onClick={() => setAviso('Os itens vêm do XML: "Adicionar" item à mão ainda não existe no ERP.')}>Adicionar</button>
                </div>
                <button type="button" className="link-botao" aria-expanded={maisOpcoes} onClick={() => setMaisOpcoes((m) => !m)}>Mais Opções {maisOpcoes ? '▴' : '▾'}</button>
                {maisOpcoes && (
                  <div className="item-linha">
                    {c('BC.FCPST', n2(i.baseFcpSt))}{c('%FCPST', num(i.aliqFcpSt), 'campo mini num')}{c('V.FCPST', n2(i.fcpSt))}
                    {c('CstPis', i.cstPis, 'campo mini')}{c('%Pis', num(i.aliqPis), 'campo mini num')}{c('$Pis', n2(i.pis))}
                    {c('CstCofins', i.cstCofins, 'campo mini')}{c('%Cofins', num(i.aliqCofins), 'campo mini num')}{c('$Cofins', n2(i.cofins))}
                  </div>
                )}
              </div>
            );
          })()}
          {faltam > 0 && <p className="negativo small">{faltam} item(ns) sem produto ligado.</p>}
          <table className="grade compacta">
            <thead>
              <tr>
                <th>Cod</th><th>Produto</th><th>NCM</th><th>CFOP</th><th className="num">Qtd.</th><th className="num">Valor Uni.</th><th className="num">Total</th>
                <th>Produto no ERP</th>
                <th className="num" title="Quantas unidades do estoque vêm em 1 unidade da nota (ex.: saco de 50 kg = 50)">Fator</th><th className="num">Qtd no estoque</th>
              </tr>
            </thead>
            <tbody>
              {nfe.itens.map((i) => {
                const l = lig[i.item] ?? { produto: '', fator: '1' };
                const mudar = (aj: Partial<Lig>) => setLig((x) => ({ ...x, [i.item]: { ...l, ...aj } }));
                const fator = lerNumero(l.fator) || 1;
                const p = produtoExemplo(Number(l.produto));
                return (
                  <tr key={i.item} className={`clicavel${i.item === (itemSel ?? nfe.itens[0].item) ? ' selecionada' : ''}`} onClick={() => setItemSel(i.item)}>
                    <td>{i.codigo}</td><td>{i.descricao}</td><td>{i.ncm}</td><td>{i.cfop}</td>
                    <td className="num">{num(i.quantidade)} {i.unidade ?? ''}</td><td className="num">{moeda(i.valorUnitario)}</td><td className="num">{moeda(i.valorTotal)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select className="campo ligar-produto" aria-label={`Produto no ERP do item ${i.item}`} value={l.produto} onChange={(e) => mudar({ produto: e.target.value })}>
                        <option value="">ligar ao produto</option>
                        {PRODUTOS_EXEMPLO.filter((x) => x.ativo).map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} - {x.descricao}</option>)}
                      </select>
                    </td>
                    <td className="num" onClick={(e) => e.stopPropagation()}>
                      <input className="campo mini num" aria-label={`Fator do item ${i.item}`} value={l.fator} onChange={(e) => mudar({ fator: e.target.value })} />
                    </td>
                    <td className="num">{num(i.quantidade * fator)} {p?.unidade ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table className="grade compacta totais-produtos">
            <thead><tr><th className="num">Total dos Produtos</th><th className="num">Total Informado na Nota</th></tr></thead>
            <tbody><tr><td className="num"><b>{moeda(nfe.itens.reduce((s, i) => s + i.valorTotal, 0))}</b></td><td className="num"><b>{moeda(nfe.totais.produtos)}</b></td></tr></tbody>
          </table>
        </div>
      ))}

      {aba === 'impostos' && (() => {
        const imp = nfe?.impostos ?? {};
        // ICMS por alíquota (até 4 linhas, como no Elevor).
        const porAliq = new Map<number, number>();
        for (const i of nfe?.itens ?? []) if (i.baseIcms) porAliq.set(i.aliqIcms, (porAliq.get(i.aliqIcms) ?? 0) + i.baseIcms);
        const aliqs: Array<[number, number] | null> = [...porAliq.entries()].slice(0, 4);
        while (aliqs.length < 4) aliqs.push(null);
        const v = (x: number | undefined) => valor(nfe ? x ?? 0 : undefined);
        return (
          <div className="entrada-nota">
            <div className="secao-titulo">Reforma Tributária</div>
            {linha('Base de Cálculo:', v(imp.baseCbsIbs))}
            {linha('Valor CBS:', v(imp.cbs), 'Valor IBS:', v(imp.ibs))}
            <div className="secao-titulo">ICMS/IPI</div>
            {aliqs.map((a, k) => (
              <Fragment key={k}>{linha('Base Cálculo ($):', so(a ? moeda(a[1]) : '', 'campo curto num'), 'Alíquotas (%):', so(a ? num(a[0]) : '', 'campo curto num'))}</Fragment>
            ))}
            {linha('Base Cálculo ST ($):', v(nfe?.baseIcmsSt), 'Substituição Tributária:', v(t?.icmsSt))}
            {linha('Base Cálculo FCP ST ($):', v(0), 'Valor FCP ST:', v(imp.fcpSt))}
            {linha('Base Cálculo FCP ($):', v(0), 'Valor FCP:', v(imp.fcp))}
            {linha('Isentas:', v(0), 'Valor FCP UF Destino:', v(imp.fcpUfDestino))}
            {linha('Outros:', v(t?.outros), 'Valor IPI:', v(t?.ipi))}
            {linha('Valor ICM:', v(t?.icms), 'Diferença Total Base:', v(nfe ? nfe.baseIcms - aliqs.reduce((s, a) => s + (a ? a[1] : 0), 0) : 0))}
            {linha('Valor ICM Desonerado:', v(imp.icmsDesonerado), '', <label className="opcao"><input type="checkbox" checked readOnly /> Validar Impostos</label>)}
            <div className="secao-titulo">Serviços</div>
            {linha('Valor do ISSQN:', v(imp.iss), 'Base de Cálculo do ISSQN:', v(imp.baseIss))}
            {linha('Valor do ISSQN Retido:', v(imp.issRetido), 'Base de Cálculo do ISSQN Retido:', v(0))}
            {linha('Valor do INSS:', v(imp.inss), 'Base de Cálculo do INSS:', v(imp.baseInss))}
            {linha('Valor do IRRF:', v(imp.irrf), 'Base de Cálculo do IRRF:', v(imp.baseIrrf))}
            {linha('Valor CSLL Retido:', v(imp.csllRetido), 'Valor PIS Retido:', v(imp.pisRetido))}
            {linha('Valor COFINS Retido:', v(imp.cofinsRetido))}
            <div className="secao-titulo">Outros Valores</div>
            {linha('Valor Guia ST:', v(0), 'Valor Diferencial de Alíquotas:', v(0))}
            {!nfe && importe}
          </div>
        );
      })()}

      {aba === 'pagamento' && (
        <div className="entrada-nota">
          {linha('Forma:', (
            <select className="campo curto" aria-label="Forma" value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="dinheiro">Dinheiro</option><option value="cheque">Cheque</option><option value="prazo">A Prazo</option>
            </select>
          ))}
          {linha('Banco:', lista('banco', BANCOS, 'Banco'))}
          {linha('Tipo Documento:', lista('tipoDocumento', TIPOS_DOCUMENTO, 'Tipo Documento'))}
          {nfe && !nfe.duplicatas.length && linha('Vencimento:', <input type="date" className="campo curto" aria-label="Vencimento" value={f.vencimento}
            onChange={(e) => setF((x) => ({ ...x, vencimento: e.target.value }))} />)}
          {nfe && (
            <table className="grade compacta parcelas-entrada">
              <thead><tr><th /><th>Banco</th><th>Data</th><th className="num">Valor</th></tr></thead>
              <tbody>
                {(nfe.duplicatas.length ? nfe.duplicatas : [{ numero: '1', vencimento: f.vencimento, valor: nfe.totais.total }]).map((d) => (
                  <tr key={d.numero}>
                    <td>{forma === 'prazo' ? 'A Prazo' : forma === 'cheque' ? 'Cheque' : 'Dinheiro'}</td><td>{f.banco}</td><td>{data(d.vencimento)}</td><td className="num">{moeda(d.valor)}</td>
                  </tr>
                ))}
                <tr className="linha-total">
                  <td>Total</td><td /><td />
                  <td className="num">{moeda(nfe.duplicatas.length ? nfe.duplicatas.reduce((s, d) => s + d.valor, 0) : nfe.totais.total)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {nfe ? <p className="muted small">As parcelas vêm das duplicatas do XML e viram títulos a pagar ao gravar (todas na forma escolhida).</p> : importe}
        </div>
      )}

      {aba === 'transportador' && (
        <div className="entrada-nota">
          <p className="muted small">No Elevor esta aba lança o CT-e do frete (conhecimento de transporte), à parte da nota. No ERP isso ainda não existe: os campos
            mostram o transporte informado na NF-e.</p>
          {linha('', <>
            <button type="button" className="btn primario" onClick={() => semAcao('Importar XML (CT-e)')}><FileUploadOutlinedIcon /> Importar XML</button>
            <button type="button" className="btn primario" onClick={() => semAcao('CTes Destinados (Sefaz)')}>CTes Destinados (Sefaz)</button>
          </>)}
          {linha('ID CTe:', <>{so('')}<button type="button" className="btn" onClick={() => semAcao('Buscar XML CTe')}>Buscar XML CTe</button></>)}
          {linha('Empresa:', so(EMPRESAS.find((e) => String(e.id) === f.empresa)?.nome ?? ''))}
          {linha('Transportador:', <>{so(nfe?.transporte.documento, 'campo curto')}{so(nfe?.transporte.nome)}</>)}
          {linha('Número Documento:', <>{so('', 'campo curto')}<span>Série:</span>{so('', 'campo mini')}</>)}
          {linha('Modelo:', so(nfe ? '57' : '', 'campo mini'))}
          {linha('Remetente:', so(nfe?.emitente.nome))}
          {linha('Valor Frete:', valor(t?.frete))}
          {linha('Tipo Frete:', so(nfe?.transporte.modalidade != null ? MOD_FRETE[nfe.transporte.modalidade] ?? nfe.transporte.modalidade : '', 'campo cheio'))}
          {linha('', <label className="opcao"><input type="checkbox" checked disabled /> Adicionar Valor do Frete ao Custo do Produto</label>)}
          {linha('Valor da Carga:', valor(t?.total))}
          {linha('Placa:', so(nfe?.transporte.placa, 'campo curto'), 'UF:', so(nfe?.transporte.uf, 'campo mini'))}
          {linha('Volumes:', so(nfe ? num(nfe.transporte.volumes) : '', 'campo curto num'))}
          {linha('Peso Bruto:', so(nfe ? num(nfe.transporte.pesoBruto) : '', 'campo curto num'), 'Peso Líquido:', so(nfe ? num(nfe.transporte.pesoLiquido) : '', 'campo curto num'))}
          {linha('', <>
            <button type="button" className="btn" onClick={() => semAcao('Gravar Frete')}>Gravar Frete</button>
            <button type="button" className="btn" onClick={() => semAcao('Novo Frete')}>Novo Frete</button>
          </>)}
        </div>
      )}

      <div className="botoes">
        <button type="button" className="btn primario" disabled={!nfe || Boolean(existente)} onClick={gravar}>Gravar</button>
        <button type="button" className="btn" onClick={novo}>Novo</button>
        <Link className="btn" to="/erp/notas">Consulta de Notas</Link>
      </div>
    </div>
  );
}
