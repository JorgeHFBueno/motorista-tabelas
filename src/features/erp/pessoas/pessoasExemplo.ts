// Clientes e Fornecedores do ERP (2026-11-24): telas de demonstração, sem gravação. Os cadastros abaixo são exemplos
// fictícios para ver as telas funcionando; os dados reais virão do Elevor, pela API, e a gravação, em coleções `erp-`,
// chega quando a persistência for ligada. Telas e campos copiados do ERP do Samuel (CD_Clientes do Elevor).
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

export const AVISO_DEMONSTRACAO = 'Demonstração: os cadastros são exemplos e nada é gravado. Os dados reais virão do Elevor.';

export type Papel = 'cliente' | 'fornecedor' | 'transportador' | 'funcionario';

export const PAPEIS: ReadonlyArray<{ valor: Papel; rotulo: string }> = [
  { valor: 'cliente', rotulo: 'Cliente' },
  { valor: 'fornecedor', rotulo: 'Fornecedor' },
  { valor: 'transportador', rotulo: 'Transportador' },
  { valor: 'funcionario', rotulo: 'Funcionário' },
];

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR',
  'RS', 'SC', 'SE', 'SP', 'TO'];
export const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI', 'ME'];
export const CATEGORIAS = ['Construtora', 'Pessoa física', 'Agregados', 'Ferragens', 'Transporte', 'Condomínio'];
export const TIPOS_EMAIL = ['Geral', 'Nota Fiscal', 'Financeiro', 'Cobrança'];

// Listas da ficha em linhas de texto, na ordem das colunas de cada lista.
export type PessoaExemplo = {
  codigo: number;
  tipo: 'F' | 'J';
  ativo: boolean;
  nome: string;
  fantasia: string;
  papeis: Papel[];
  /** Só dígitos; vazio quando o cadastro não tem. */
  documento: string;
  inscricaoEstadual: string;
  regime: string;
  categoria: string;
  vendedor: string;
  uf: string;
  cidade: string;
  bairro: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento: string;
  /** [descrição, telefone] */
  telefones: string[][];
  /** [e-mail, tipo] */
  emails: string[][];
  /** [descrição, telefone, celular, e-mail] */
  contatos: string[][];
  /** Indicadores: [data, documento, valor, descrição] dos títulos dos últimos 12 meses. */
  titulos: string[][];
};

export const VENDEDORES_EXEMPLO: string[][] = [
  // [nome, e-mail, comissão %, ativo]
  ['Ana Exemplo', 'ana@example.com', '2,5', 'Sim'],
  ['Carlos Modelo', 'carlos@example.com', '3', 'Sim'],
  ['Vendas Internas', 'vendas@example.com', '0', 'Sim'],
  ['Paulo Antigo', 'paulo@example.com', '2', 'Não'],
];

const vazio = { inscricaoEstadual: '', regime: '', complemento: '', contatos: [], titulos: [] };

export const PESSOAS_EXEMPLO: PessoaExemplo[] = [
  {
    ...vazio, codigo: 1021, tipo: 'J', ativo: true, nome: 'Construtora Exemplo Ltda', fantasia: 'Construtora Exemplo', papeis: ['cliente'],
    documento: '12345678000195', inscricaoEstadual: '0960012345', regime: 'Lucro Presumido', categoria: 'Construtora', vendedor: 'Ana Exemplo',
    uf: 'RS', cidade: 'Porto Alegre', bairro: 'Centro Histórico', cep: '90010-000', endereco: 'Rua dos Exemplos', numero: '100', complemento: 'Sala 2',
    telefones: [['Recepção', '(51) 3000-0001'], ['Compras', '(51) 99900-0001']],
    emails: [['contato@example.com', 'Geral'], ['nfe@example.com', 'Nota Fiscal']],
    contatos: [['Engenheiro da obra', '', '(51) 99900-0011', 'obra@example.com'], ['Financeiro', '(51) 3000-0002', '', 'financeiro@example.com']],
    titulos: [['2026-10-15', 'NF 4512', 'R$ 48.200,00', 'Venda de pré-moldados'], ['2026-08-02', 'NF 4398', 'R$ 12.750,00', 'Venda de pré-moldados'],
      ['2026-05-20', 'REC 211', 'R$ 3.000,00', 'Adiantamento']],
  },
  {
    ...vazio, codigo: 1088, tipo: 'J', ativo: true, nome: 'Areia e Brita Modelo Ltda', fantasia: 'Areial Modelo', papeis: ['fornecedor'],
    documento: '11222333000181', inscricaoEstadual: '1230004567', regime: 'Simples Nacional', categoria: 'Agregados', vendedor: '',
    uf: 'RS', cidade: 'Venâncio Aires', bairro: 'Distrito Industrial', cep: '95800-000', endereco: 'Estrada do Areal', numero: 's/n',
    telefones: [['Pedidos', '(51) 3000-0101']], emails: [['pedidos@example.com', 'Geral'], ['cobranca@example.com', 'Cobrança']],
    titulos: [['2026-11-03', 'NF 77810', 'R$ 9.840,00', 'Compra de brita 1'], ['2026-09-28', 'NF 76102', 'R$ 7.115,00', 'Compra de areia média']],
  },
  {
    ...vazio, codigo: 1102, tipo: 'J', ativo: true, nome: 'Transportes Demonstração Ltda', fantasia: 'TransDemo', papeis: ['transportador', 'fornecedor'],
    documento: '', categoria: 'Transporte', vendedor: '', uf: 'RS', cidade: 'Lajeado', bairro: 'Montanha', cep: '95900-000',
    endereco: 'Avenida das Cargas', numero: '1500', telefones: [['Expedição', '(51) 99900-0201']], emails: [['frete@example.com', 'Geral']],
  },
  {
    ...vazio, codigo: 1157, tipo: 'F', ativo: true, nome: 'Maria Exemplo da Silva', fantasia: '', papeis: ['cliente'], documento: '12345678909',
    categoria: 'Pessoa física', vendedor: 'Carlos Modelo', uf: 'RS', cidade: 'Santa Cruz do Sul', bairro: 'Universitário', cep: '96815-000',
    endereco: 'Rua das Flores', numero: '45', complemento: 'Casa', telefones: [['Celular', '(51) 99900-0301']], emails: [['maria@example.com', 'Geral']],
    titulos: [['2026-07-11', 'NF 4320', 'R$ 2.380,00', 'Venda de blocos']],
  },
  {
    ...vazio, codigo: 1203, tipo: 'F', ativo: true, nome: 'João Modelo de Souza', fantasia: '', papeis: ['cliente', 'fornecedor'], documento: '11144477735',
    categoria: 'Pessoa física', vendedor: 'Ana Exemplo', uf: 'RS', cidade: 'Caxias do Sul', bairro: 'São Pelegrino', cep: '95010-000',
    endereco: 'Rua da Amostra', numero: '780', telefones: [['Celular', '(54) 99900-0401']], emails: [],
  },
  {
    ...vazio, codigo: 1240, tipo: 'J', ativo: false, nome: 'Ferragens Fictícia ME', fantasia: 'Ferragens Fictícia', papeis: ['fornecedor'], documento: '',
    regime: 'ME', categoria: 'Ferragens', vendedor: '', uf: 'SC', cidade: 'Chapecó', bairro: 'Centro', cep: '89801-000', endereco: 'Rua do Teste',
    numero: '12', telefones: [['Loja', '(49) 3000-0501']], emails: [['loja@example.com', 'Geral']],
  },
  {
    ...vazio, codigo: 1312, tipo: 'J', ativo: true, nome: 'Concreto Teste S.A.', fantasia: 'Concreto Teste', papeis: ['cliente', 'fornecedor'], documento: '',
    regime: 'Lucro Real', categoria: 'Construtora', vendedor: 'Carlos Modelo', uf: 'PR', cidade: 'Curitiba', bairro: 'CIC', cep: '81000-000',
    endereco: 'Rodovia do Exemplo', numero: 'km 5', telefones: [['Central', '(41) 3000-0601']], emails: [['nfe-concreto@example.com', 'Nota Fiscal']],
  },
  {
    ...vazio, codigo: 1350, tipo: 'J', ativo: true, nome: 'Condomínio Residencial Exemplo', fantasia: 'Residencial Exemplo', papeis: ['cliente'], documento: '',
    categoria: 'Condomínio', vendedor: 'Vendas Internas', uf: 'RS', cidade: 'Porto Alegre', bairro: 'Menino Deus', cep: '90150-000',
    endereco: 'Avenida Modelo', numero: '2200', telefones: [['Síndico', '(51) 99900-0701']], emails: [['sindico@example.com', 'Geral']],
  },
];

export const pessoaExemplo = (codigo: string | undefined) => PESSOAS_EXEMPLO.find((p) => String(p.codigo) === codigo) ?? null;
