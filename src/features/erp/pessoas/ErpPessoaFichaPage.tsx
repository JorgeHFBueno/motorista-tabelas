import { Fragment, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { formatarDocumento, normalizarDocumento } from '../../portal-cliente/portalDominio';
import '../erpElevor.css';
import { LinhaFicha, ListaFicha } from '../FichaCampos';
import { cols, ehLista, montar, type Item, type Lista } from '../camposFicha';
import {
  AVISO_DEMONSTRACAO, CATEGORIAS, PAPEIS, REGIMES, TIPOS_EMAIL, UFS, VENDEDORES_EXEMPLO, pessoaExemplo, type PessoaExemplo,
} from './pessoasExemplo';

// /erp/pessoas/:codigo e /erp/pessoas/novo: ficha de Clientes e Fornecedores no layout da CD_Clientes do Elevor, como o
// ERP do Samuel (cadastros/pessoas.ts, comparado print a print): "código - nome - fantasia" e as abas no alto, rótulos em
// negrito à esquerda, pares lado a lado, larguras medidas no Elevor e os botões Gravar, Novo, Excluir, Consultar e
// Impressão embaixo. Demonstração: tudo se edita na tela e nada é gravado.

const desligado = (rotulo: string, icone?: ReactNode) => (
  <button key={rotulo} className="btn" type="button" disabled title="Na demonstração, sem esta ação">{icone}{rotulo}</button>
);
const VENDEDORES_ATIVOS = VENDEDORES_EXEMPLO.filter((v) => v[3] === 'Sim').map((v) => v[0]);

const PRINCIPAL: Item[] = [
  { rotulo: 'Nome', largura: 'cheio' },
  { rotulo: 'Nome Fantasia', largura: 'cheio' },
  { rotulo: 'documento', especial: 'documento' },
  { rotulo: 'RG', largura: 359, so: 'F' },
  { rotulo: 'Órgão Expedidor', largura: 100, junto: true, so: 'F' },
  { rotulo: 'UF do RG', tipo: 'opcoes', opcoes: UFS, largura: 100, anexo: 'UF:', so: 'F' },
  { rotulo: 'Data Expedição RG', tipo: 'data', so: 'F' },
  { rotulo: 'Sexo', tipo: 'radio', opcoes: ['Masculino', 'Feminino', 'Não Informado'], so: 'F' },
  { rotulo: 'Data Nasc', tipo: 'data', junto: true, so: 'F' },
  { rotulo: 'Inscrição Estadual' },
  { rotulo: 'Inscrição Municipal', junto: true, so: 'J' },
  { rotulo: 'Data Abertura', tipo: 'data', so: 'J' },
  { rotulo: 'Documento Exterior', junto: true },
  { rotulo: 'Atividade Fiscal', tipo: 'opcoes', opcoes: ['Consumidor Final', 'Indústria', 'Revenda', 'Transportadora'], largura: 315,
    botoes: [<button key="lapis" className="btn btn-icone" type="button" disabled title="Na demonstração, sem esta ação"><EditOutlinedIcon /></button>] },
  { rotulo: 'Regime', tipo: 'opcoes', opcoes: REGIMES, junto: true, so: 'J' },
  { rotulo: 'Contribuinte ICMS', tipo: 'caixa' },
  { rotulo: 'CNAE', tipo: 'longo', so: 'J', ajuda: 'Um CNAE por linha (código e descrição).' },
  { rotulo: 'Vendedor', tipo: 'opcoes', opcoes: VENDEDORES_ATIVOS, largura: 'cheio' },
  { rotulo: 'Cidade', especial: 'cidade', secao: 'Endereço' },
  { rotulo: 'Bairro' },
  { rotulo: 'CEP', junto: true },
  { rotulo: 'Endereço', largura: 748 },
  { rotulo: 'Nº', largura: 229, anexo: 'Nº:' },
  { rotulo: 'Complemento' },
  { rotulo: 'Ponto de Referência', junto: true },
  { lista: 'Telefone(s)', colunas: cols('Descrição', 'Telefone'), estreita: true, botao: 'Adicionar Telefone', inicial: 'telefones' },
  { lista: 'E-mail(s)', colunas: [{ rotulo: 'E-mail' }, { rotulo: 'Tipo', opcoes: TIPOS_EMAIL }], estreita: true, botao: 'Adicionar E-mail', inicial: 'emails' },
];

const DADOS_ADICIONAIS: Item[] = [
  { rotulo: 'Canal' }, { rotulo: 'Grupo Econômico', junto: true },
  { rotulo: 'Situação' }, { rotulo: 'Categoria', tipo: 'opcoes', opcoes: CATEGORIAS, junto: true },
  { rotulo: 'Região' }, { rotulo: 'Caixa Postal', junto: true },
  { rotulo: 'Contato' }, { rotulo: 'Site', junto: true },
  { rotulo: 'Matrícula' }, { rotulo: 'Associado', tipo: 'caixa', junto: true },
  { rotulo: 'Nacionalidade' }, { rotulo: 'Código Integração Domínio', junto: true },
  { rotulo: 'Tabela de Preço', tipo: 'opcoes', opcoes: [], secao: 'Configurações Comerciais' },
  { rotulo: 'Tabela de Preço Mínimo', tipo: 'opcoes', opcoes: [], junto: true },
  { rotulo: 'Natureza de Operação', tipo: 'opcoes', opcoes: [] },
  { rotulo: 'Natureza de Operação Entrada de Fornecedor', tipo: 'opcoes', opcoes: [], junto: true },
  { rotulo: 'Condição de Pagamento', tipo: 'opcoes', opcoes: [] }, { rotulo: 'Prazo Máximo (Dias)', tipo: 'numero', junto: true },
  { rotulo: 'Forma de Pagamento', tipo: 'opcoes', opcoes: ['Dinheiro', 'Cheque', 'Cartão', 'Boleto', 'À Prazo'] },
  { rotulo: 'Situação Padrão Títulos', tipo: 'opcoes', opcoes: [], junto: true },
  { rotulo: 'Banco', tipo: 'opcoes', opcoes: [] }, { rotulo: 'Valor Despesas Acessórias NF', tipo: 'moeda', junto: true },
  { rotulo: 'Empresa Padrão (Pré-Venda)', tipo: 'opcoes', opcoes: [] }, { rotulo: 'Utilizado para Inclusão Automática', tipo: 'caixa', junto: true },
  { rotulo: 'Status Pedido', tipo: 'opcoes', opcoes: [] }, { rotulo: 'Transportador', tipo: 'opcoes', opcoes: [], junto: true },
  { rotulo: 'Rota de Entrega' }, { rotulo: 'Horários de Rota de Entrega', junto: true },
  { rotulo: 'Sequência Entrega', tipo: 'numero' },
  { rotulo: 'Tipo de Frete', tipo: 'opcoes', junto: true, opcoes: ['Contratação do Frete por conta do Remetente (CIF)',
    'Contratação do Frete por conta do Destinatário (FOB)', 'Contratação do Frete por conta de Terceiros', 'Transporte Próprio por conta do Remetente',
    'Transporte Próprio por conta do Destinatário', 'Sem Ocorrência de Transporte'] },
  { rotulo: 'Valor Frete', tipo: 'moeda' }, { rotulo: 'Desconto Financeiro (%)', tipo: 'percentual', junto: true },
  { rotulo: 'Alíquota IRRF', tipo: 'percentual', secao: 'Configurações Tributárias e Fiscais' },
  { rotulo: 'CREA' }, { rotulo: 'Registro da FEPAM', junto: true },
  { rotulo: 'Inscrição Suframa' }, { rotulo: 'Matrícula CEI (INSS)', junto: true },
  { rotulo: 'Contribuição Previdenciária (Reinf)', tipo: 'opcoes', opcoes: ['Não é Contribuinte 11%', 'Contribuinte 3,5%'] },
  { rotulo: 'ICMS ST Retido Anteriormente (XML Fornecedor)', tipo: 'radio', opcoes: ['Valor Total', 'Valor Unitário'] },
  { rotulo: 'Associação de Produto', tipo: 'radio', opcoes: ['Código do Produto', 'Código de Barras'], junto: true },
  { rotulo: 'Não Transmitir Automaticamente NFe Sefaz', tipo: 'caixa' }, { rotulo: 'Imprimir Impostos ST Danfe', tipo: 'caixa', junto: true },
  { rotulo: 'Número CAEPF' }, { rotulo: 'Validade CAEPF', tipo: 'data', junto: true },
  { rotulo: 'Ente Governamental', tipo: 'opcoes', opcoes: ['Nenhum', 'União', 'Estado', 'Distrito Federal', 'Município'], secao: 'Reforma Tributária' },
  { rotulo: 'Contribuinte CBS/IBS', tipo: 'caixa', junto: true },
  { lista: 'CPFs/CNPJs autorizados para o download de documentos eletrônicos', colunas: cols('Descrição', 'CPF/CNPJ', 'Tipo de documento autorizado') },
  { rotulo: 'Assinar com certificado digital apenas quando técnico emitir o Documento', tipo: 'caixa', secao: 'Certificado Digital' },
];

const OUTROS_DADOS: Item[] = [
  { rotulo: 'Limite Crédito / Validade', tipo: 'moeda' }, { rotulo: 'Validade do limite', tipo: 'data', anexo: '' },
  { rotulo: 'Tolerância Devedores (Dias)', tipo: 'numero' }, { rotulo: 'Tipo de dias', tipo: 'opcoes', opcoes: ['Corridos', 'Úteis'], largura: 'curto', anexo: '' },
  { rotulo: 'Comissão(%)', tipo: 'percentual' },
  { rotulo: 'Observações', tipo: 'longo' }, { rotulo: 'Observações Financeiras', tipo: 'longo' }, { rotulo: 'Observações Confidenciais', tipo: 'longo' },
  { rotulo: 'Mensagem p/NF', tipo: 'longo' }, { rotulo: 'Mensagem Boleto', largura: 'cheio' },
  { rotulo: 'Não Cobrar Taxa Bancária Boleto', tipo: 'caixa' },
  { rotulo: 'Bloqueado', tipo: 'radio', opcoes: ['Não', 'Sim'] },
  { rotulo: 'Utilizar o endereço da guia principal como endereço padrão para cobrança', tipo: 'caixa', secao: 'Endereço de Cobrança' },
  { rotulo: 'Cidade', largura: 'cheio' },
  { rotulo: 'Bairro' }, { rotulo: 'CEP', junto: true },
  { rotulo: 'Endereço' }, { rotulo: 'Nº', largura: 'curto', junto: true },
  { rotulo: 'Complemento' },
];

const FICHA_COMPLEMENTAR: Item[] = [
  { rotulo: 'Atividade' },
  { rotulo: 'Faturamento Mensal', tipo: 'moeda', secao: 'Dados Complementares' }, { rotulo: 'Data Início Atividade', tipo: 'data', junto: true },
  { lista: 'Sócios', colunas: cols('Nome', 'CPF/CNPJ', 'RG', 'Data Nascimento', 'Telefone', 'Endereço', 'Cargo', 'Outras Rendas', 'Data Saída') },
  { lista: 'Dados Bancários', colunas: cols('Banco', 'Agência', 'Conta', 'Nome Titular', 'CPF/CNPJ Titular', 'Cartão', 'Limite', 'Chave Pix', 'Gerente', 'Telefone', 'Obs.') },
  { lista: 'Referência Comercial', colunas: cols('Empresa', 'Telefone', 'Data Última Compra', 'Observação') },
  { lista: 'Bens/Imóveis', colunas: cols('Descrição', 'Modelo', 'Quantidade', 'Ano', 'Situação') },
  { lista: 'Avalistas', colunas: cols('Avalista') },
  { lista: 'Procurações', colunas: cols('Autorizado', 'Modelo', 'Data Emissão', 'Validade') },
];

const ABAS: Array<[string, Item[]]> = [
  ['Principal', PRINCIPAL],
  ['Dados adicionais', DADOS_ADICIONAIS],
  ['Outros dados', OUTROS_DADOS],
  ['Ficha Complementar', FICHA_COMPLEMENTAR],
  ['Veículos', [{ lista: 'Veículos', colunas: cols('Placa/Chassi', 'Modelo', 'Descrição', 'Ano Fab.') }]],
  ['Ocorrências', [{ lista: 'Ocorrências', colunas: [{ rotulo: 'Data', data: true }, { rotulo: 'Tipo de Ocorrência', opcoes: ['Registro', 'Alerta',
    'Ocorrência', 'Observações O.S.', 'Observações Pedidos', 'Observações Expedições'] }, { rotulo: 'Texto' }] }]],
  ['Contatos', [{ lista: 'Contatos', colunas: cols('Descrição', 'Telefone', 'Celular', 'Email'), inicial: 'contatos' }]],
  ['Arquivos', [{ lista: 'Arquivos', colunas: cols('Título', 'Data', 'Validade', 'Tipo de Arquivo') }]],
  ['Indicadores', []],
  ['Campos Específicos', []],
];

function Indicadores({ pessoa }: { pessoa: PessoaExemplo | null }) {
  const titulos = pessoa?.titulos ?? [];
  return (
    <>
      <div className="fc-secao">Resumo de Movimentações (Últimos 12 meses)</div>
      <div className="fc-lista">
        <table className="grade compacta">
          <thead><tr><th>Data</th><th>Documento</th><th className="num">Valor</th><th>Descrição</th></tr></thead>
          <tbody>
            {titulos.map(([data, documento, valor, descricao]) => (
              <tr key={documento}><td>{data.split('-').reverse().join('/')}</td><td>{documento}</td><td className="num">{valor}</td><td>{descricao}</td></tr>
            ))}
            {!titulos.length && <tr><td colSpan={4} className="vazio">Nenhum registro encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Ficha({ pessoa: p }: { pessoa: PessoaExemplo | null }) {
  const navigate = useNavigate();
  const [aba, setAba] = useState(ABAS[0][0]);
  const [tipo, setTipo] = useState<'F' | 'J'>(p?.tipo ?? 'J');
  const [documento, setDocumento] = useState(formatarDocumento(p?.documento ?? ''));
  const [cidade, setCidade] = useState(p ? `${p.cidade} - ${p.uf}` : '');
  const [mensagem, setMensagem] = useState('');
  const novo = !p;
  const valido = normalizarDocumento(documento);
  const invalido = Boolean(documento.trim()) && (!valido || valido.length !== (tipo === 'F' ? 11 : 14));
  const nomeDocumento = tipo === 'F' ? 'CPF' : 'CNPJ';

  const valores: Record<string, string> = p ? {
    Nome: p.nome, 'Nome Fantasia': p.fantasia, 'Inscrição Estadual': p.inscricaoEstadual, Regime: p.regime, Vendedor: p.vendedor, Bairro: p.bairro,
    CEP: p.cep, Endereço: p.endereco, 'Nº': p.numero, Complemento: p.complemento, Categoria: p.categoria,
  } : {};
  const especiais: Record<string, ReactNode> = {
    documento: <>
      <input className="campo" style={{ width: 359, maxWidth: '100%', flex: 'none' }} aria-label={nomeDocumento} inputMode="numeric" value={documento}
        onChange={(e) => setDocumento(e.target.value)} onBlur={() => { if (valido && !invalido) setDocumento(formatarDocumento(valido)); }} />
      {desligado('Consultar no Sefaz', <SearchIcon />)}
      {desligado('Consultar na Receita Federal', <OpenInNewIcon />)}
      {invalido && <span className="erro-campo">{nomeDocumento} inválido</span>}
    </>,
    cidade: <>
      <input className="campo cheio" aria-label="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <button className="btn btn-icone" type="button" title="Limpar" aria-label="Limpar a cidade" onClick={() => setCidade('')}><CloseIcon /></button>
    </>,
  };
  const iniciais: Record<string, string[][] | undefined> = p ? { telefones: p.telefones, emails: p.emails, contatos: p.contatos } : {};
  const listaInicial = (l: Lista) => (l.inicial ? iniciais[l.inicial] : undefined);

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_DEMONSTRACAO}</div>
      {p && <div className="ficha-titulo">{p.codigo} - {p.nome}{p.fantasia && p.fantasia !== p.nome ? ` - ${p.fantasia}` : ''}</div>}
      <div className="abas" role="tablist" aria-label="Abas do cadastro">
        {ABAS.map(([nome]) => (
          <button key={nome} type="button" role="tab" aria-selected={aba === nome} className={`aba${aba === nome ? ' ativa' : ''}`} onClick={() => setAba(nome)}>{nome}</button>
        ))}
      </div>
      <form className="ficha-cad negrito" onSubmit={(e) => { e.preventDefault(); setMensagem('Demonstração: nada foi gravado.'); }}>
        {/* Todas as abas ficam montadas (só escondidas), para o que foi digitado não sumir ao trocar de aba. */}
        {ABAS.map(([nome, itens]) => (
          <div key={nome} className="fc-aba" hidden={aba !== nome} role="tabpanel">
            {nome === 'Principal' && <>
              <div className="fc-linha">
                <div className="fc-rotulo" />
                <div className="fc-controle largo">
                  <div className="opcoes">
                    <label className="opcao"><input type="radio" name="tipo_pessoa" checked={tipo === 'F'} onChange={() => setTipo('F')} /> Física</label>
                    <label className="opcao"><input type="radio" name="tipo_pessoa" checked={tipo === 'J'} onChange={() => setTipo('J')} /> Jurídica</label>
                  </div>
                  <label className="opcao"><input type="checkbox" defaultChecked={p?.ativo ?? true} /> Ativo</label>
                </div>
              </div>
              <div className="fc-linha">
                <div className="fc-rotulo">Código:</div>
                <div className="fc-controle largo">
                  <input className="campo codigo" aria-label="Código" value={p ? String(p.codigo) : ''} readOnly />
                  {desligado('Carregar Imagem', <DescriptionOutlinedIcon />)}
                  {desligado('Capturar Imagem', <PhotoCameraOutlinedIcon />)}
                </div>
              </div>
            </>}
            {montar(itens, tipo).map((linha, n) => {
              if (ehLista(linha)) return (
                <ListaFicha key={linha.lista} lista={linha} inicial={listaInicial(linha)} />
              );
              return (
                <Fragment key={linha[0][0].rotulo + n}>
                  {/* Tipo (papéis) logo depois do Nome Fantasia, como no Elevor */}
                  {nome === 'Principal' && linha[0][0].especial === 'documento' && (
                    <div className="fc-linha">
                      <div className="fc-rotulo">Tipo:</div>
                      <div className="fc-controle largo">
                        {[PAPEIS[0], PAPEIS[1], PAPEIS[3], PAPEIS[2]].map((x) => (
                          <label key={x.valor} className="opcao">
                            <input type="checkbox" defaultChecked={p ? p.papeis.includes(x.valor) : x.valor === 'cliente'} /> {x.rotulo}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <LinhaFicha linha={linha} valores={valores} especiais={especiais} rotulos={{ documento: `${nomeDocumento}:` }} />
                </Fragment>
              );
            })}
            {nome === 'Indicadores' && <Indicadores pessoa={p} />}
          </div>
        ))}
        {mensagem && <div className="mensagem">{mensagem}</div>}
        <div className="botoes">
          <button className="btn primario" type="submit">Gravar</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/pessoas/novo')}>Novo</button>
          <button className="btn" type="button" disabled={novo} onClick={() => setMensagem('Demonstração: nada foi excluído.')}>Excluir</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/pessoas')}>Consultar</button>
          <button className="btn" type="button" disabled title="Na demonstração, sem impressão">Impressão</button>
        </div>
      </form>
    </div>
  );
}

export default function ErpPessoaFichaPage() {
  const { codigo = '' } = useParams();
  const navigate = useNavigate();
  const pessoa = pessoaExemplo(codigo);
  if (codigo !== 'novo' && !pessoa) {
    return (
      <div className="erp-elevor">
        <div className="mensagem">Cadastro não encontrado.</div>
        <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/pessoas')}>Consultar</button></div>
      </div>
    );
  }
  // key: trocar de cadastro recomeça a ficha.
  return <Ficha key={codigo} pessoa={pessoa} />;
}
