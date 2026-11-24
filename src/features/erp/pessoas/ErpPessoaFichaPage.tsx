import { Fragment, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert, Box, Button, Checkbox, Container, FormControlLabel, FormGroup, InputAdornment, MenuItem, Paper, Radio, RadioGroup, Snackbar, Stack, Switch,
  Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, TextField, Typography,
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { formatarDocumento, normalizarDocumento } from '../../portal-cliente/portalDominio';
import ListaItens from './ListaItens';
import {
  AVISO_DEMONSTRACAO, CATEGORIAS, PAPEIS, REGIMES, TIPOS_EMAIL, UFS, VENDEDORES_EXEMPLO, pessoaExemplo, type PessoaExemplo,
} from './pessoasExemplo';

// /erp/pessoas/:codigo e /erp/pessoas/novo: ficha de Cliente/Fornecedor com as abas do ERP (CD_Clientes do Elevor; a aba
// Campos Específicos, vazia no ERP, ficou de fora). Demonstração: os campos se editam na tela, e Salvar não grava nada.

type Campo = { rotulo: string; tipo?: 'data' | 'moeda' | 'numero' | 'longo' | 'sim'; opcoes?: string[]; largo?: true; secao?: string };

const SIM_NAO = ['Não', 'Sim'];
const VENDEDORES_ATIVOS = VENDEDORES_EXEMPLO.filter((v) => v[3] === 'Sim').map((v) => v[0]);

const CAMPOS_PF: Campo[] = [
  { rotulo: 'RG' }, { rotulo: 'Órgão Expedidor' }, { rotulo: 'UF do RG', opcoes: UFS }, { rotulo: 'Data Expedição RG', tipo: 'data' },
  { rotulo: 'Sexo', opcoes: ['Masculino', 'Feminino', 'Não Informado'] }, { rotulo: 'Data Nasc.', tipo: 'data' },
];
const CAMPOS_PJ: Campo[] = [
  { rotulo: 'Inscrição Municipal' }, { rotulo: 'Data Abertura', tipo: 'data' }, { rotulo: 'Regime', opcoes: REGIMES }, { rotulo: 'CNAE', tipo: 'longo' },
];
const CAMPOS_COMUNS: Campo[] = [
  { rotulo: 'Inscrição Estadual' }, { rotulo: 'Documento Exterior' },
  { rotulo: 'Atividade Fiscal', opcoes: ['Consumidor Final', 'Indústria', 'Revenda', 'Transportadora'] },
  { rotulo: 'Vendedor', opcoes: VENDEDORES_ATIVOS }, { rotulo: 'Contribuinte ICMS', tipo: 'sim' },
];
const ENDERECO: Campo[] = [
  { rotulo: 'Estado', opcoes: UFS, secao: 'Endereço' }, { rotulo: 'Cidade' }, { rotulo: 'Bairro' }, { rotulo: 'CEP' }, { rotulo: 'Endereço' },
  { rotulo: 'Nº' }, { rotulo: 'Complemento' }, { rotulo: 'Ponto de Referência' },
];

const DADOS_ADICIONAIS: Campo[] = [
  { rotulo: 'Canal' }, { rotulo: 'Grupo Econômico' }, { rotulo: 'Situação' }, { rotulo: 'Categoria', opcoes: CATEGORIAS }, { rotulo: 'Região' },
  { rotulo: 'Caixa Postal' }, { rotulo: 'Contato' }, { rotulo: 'Site' }, { rotulo: 'Matrícula' }, { rotulo: 'Nacionalidade' },
  { rotulo: 'Código Integração Domínio' }, { rotulo: 'Associado', tipo: 'sim' },
  { rotulo: 'Tabela de Preço', secao: 'Configurações Comerciais' }, { rotulo: 'Tabela de Preço Mínimo' }, { rotulo: 'Natureza de Operação' },
  { rotulo: 'Natureza de Operação Entrada de Fornecedor' }, { rotulo: 'Condição de Pagamento' }, { rotulo: 'Prazo Máximo (Dias)', tipo: 'numero' },
  { rotulo: 'Forma de Pagamento', opcoes: ['Dinheiro', 'Cheque', 'Cartão', 'Boleto', 'À Prazo'] }, { rotulo: 'Situação Padrão Títulos' },
  { rotulo: 'Banco' }, { rotulo: 'Valor Despesas Acessórias NF', tipo: 'moeda' }, { rotulo: 'Empresa Padrão (Pré-Venda)' }, { rotulo: 'Status Pedido' },
  { rotulo: 'Transportador' }, { rotulo: 'Rota de Entrega' }, { rotulo: 'Horários de Rota de Entrega' }, { rotulo: 'Sequência Entrega', tipo: 'numero' },
  { rotulo: 'Tipo de Frete', opcoes: ['Por conta do Remetente (CIF)', 'Por conta do Destinatário (FOB)', 'Por conta de Terceiros',
    'Transporte Próprio do Remetente', 'Transporte Próprio do Destinatário', 'Sem Ocorrência de Transporte'] },
  { rotulo: 'Valor Frete', tipo: 'moeda' }, { rotulo: 'Desconto Financeiro (%)', tipo: 'numero' },
  { rotulo: 'Utilizado para Inclusão Automática', tipo: 'sim' },
  { rotulo: 'Alíquota IRRF (%)', tipo: 'numero', secao: 'Configurações Tributárias e Fiscais' }, { rotulo: 'CREA' }, { rotulo: 'Registro da FEPAM' },
  { rotulo: 'Inscrição Suframa' }, { rotulo: 'Matrícula CEI (INSS)' },
  { rotulo: 'Contribuição Previdenciária (Reinf)', opcoes: ['Não é Contribuinte 11%', 'Contribuinte 3,5%'] },
  { rotulo: 'ICMS ST Retido Anteriormente (XML Fornecedor)', opcoes: ['Valor Total', 'Valor Unitário'] },
  { rotulo: 'Associação de Produto', opcoes: ['Código do Produto', 'Código de Barras'] }, { rotulo: 'Número CAEPF' },
  { rotulo: 'Validade CAEPF', tipo: 'data' }, { rotulo: 'Não Transmitir Automaticamente NFe Sefaz', tipo: 'sim' },
  { rotulo: 'Imprimir Impostos ST Danfe', tipo: 'sim' },
  { rotulo: 'Ente Governamental', opcoes: ['Nenhum', 'União', 'Estado', 'Distrito Federal', 'Município'], secao: 'Reforma Tributária' },
  { rotulo: 'Contribuinte CBS/IBS', tipo: 'sim' },
  { rotulo: 'Assinar com certificado digital apenas quando técnico emitir o Documento', tipo: 'sim', secao: 'Certificado Digital', largo: true },
];

const OUTROS_DADOS: Campo[] = [
  { rotulo: 'Limite Crédito', tipo: 'moeda' }, { rotulo: 'Validade do limite', tipo: 'data' }, { rotulo: 'Tolerância Devedores (Dias)', tipo: 'numero' },
  { rotulo: 'Tipo de dias', opcoes: ['Corridos', 'Úteis'] }, { rotulo: 'Comissão (%)', tipo: 'numero' }, { rotulo: 'Bloqueado', opcoes: SIM_NAO },
  { rotulo: 'Observações', tipo: 'longo' }, { rotulo: 'Observações Financeiras', tipo: 'longo' }, { rotulo: 'Observações Confidenciais', tipo: 'longo' },
  { rotulo: 'Mensagem p/NF', tipo: 'longo' }, { rotulo: 'Mensagem Boleto', largo: true }, { rotulo: 'Não Cobrar Taxa Bancária Boleto', tipo: 'sim', largo: true },
  { rotulo: 'Utilizar o endereço da guia principal como endereço padrão para cobrança', tipo: 'sim', secao: 'Endereço de Cobrança', largo: true },
  { rotulo: 'Estado', opcoes: UFS }, { rotulo: 'Cidade' }, { rotulo: 'Bairro' }, { rotulo: 'CEP' }, { rotulo: 'Endereço' }, { rotulo: 'Nº' },
  { rotulo: 'Complemento' },
];

const FICHA_COMPLEMENTAR: Campo[] = [
  { rotulo: 'Atividade', largo: true },
  { rotulo: 'Faturamento Mensal', tipo: 'moeda', secao: 'Dados Complementares' }, { rotulo: 'Data Início Atividade', tipo: 'data' },
];

const ABAS = ['Principal', 'Dados adicionais', 'Outros dados', 'Ficha Complementar', 'Veículos', 'Ocorrências', 'Contatos', 'Arquivos', 'Indicadores'];

function CampoDemo({ campo: c, valor = '' }: { campo: Campo; valor?: string }) {
  const largo = c.tipo === 'longo' || c.largo ? { gridColumn: '1 / -1' } : undefined;
  if (c.tipo === 'sim') return <FormControlLabel sx={largo} control={<Checkbox defaultChecked={valor === 'Sim'} />} label={c.rotulo} />;
  return (
    <TextField
      size="small" label={c.rotulo} defaultValue={valor} fullWidth select={Boolean(c.opcoes)} sx={largo}
      type={c.tipo === 'data' ? 'date' : c.tipo === 'numero' ? 'number' : 'text'} multiline={c.tipo === 'longo'} minRows={c.tipo === 'longo' ? 3 : undefined}
      slotProps={{
        inputLabel: c.tipo === 'data' ? { shrink: true } : undefined,
        input: c.tipo === 'moeda' ? { startAdornment: <InputAdornment position="start">R$</InputAdornment> } : undefined,
      }}
    >
      {c.opcoes?.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
    </TextField>
  );
}

function CamposGrade({ campos, valores = {} }: { campos: Campo[]; valores?: Record<string, string> }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
      {campos.map((c) => (
        <Fragment key={c.rotulo}>
          {c.secao && <Typography variant="subtitle2" fontWeight={700} sx={{ gridColumn: '1 / -1', mt: 1 }}>{c.secao}</Typography>}
          <CampoDemo campo={c} valor={valores[c.rotulo]} />
        </Fragment>
      ))}
    </Box>
  );
}

function Principal({ pessoa: p }: { pessoa: PessoaExemplo | null }) {
  const [tipo, setTipo] = useState(p?.tipo ?? 'J');
  const [documento, setDocumento] = useState(formatarDocumento(p?.documento ?? ''));
  const valido = normalizarDocumento(documento);
  const invalido = Boolean(documento.trim()) && (!valido || valido.length !== (tipo === 'F' ? 11 : 14));
  const valores: Record<string, string> = p ? {
    'Inscrição Estadual': p.inscricaoEstadual, Regime: p.regime, Vendedor: p.vendedor, Estado: p.uf, Cidade: p.cidade, Bairro: p.bairro, CEP: p.cep,
    Endereço: p.endereco, 'Nº': p.numero, Complemento: p.complemento,
  } : {};

  return (
    <Stack spacing={2.5}>
      <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap" useFlexGap>
        <RadioGroup row value={tipo} onChange={(e) => setTipo(e.target.value as 'F' | 'J')} aria-label="Tipo de pessoa">
          <FormControlLabel value="F" control={<Radio />} label="Física" />
          <FormControlLabel value="J" control={<Radio />} label="Jurídica" />
        </RadioGroup>
        <FormControlLabel control={<Switch defaultChecked={p?.ativo ?? true} />} label="Ativo" />
      </Stack>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <TextField size="small" label="Nome" required defaultValue={p?.nome ?? ''} sx={{ gridColumn: '1 / -1' }} />
        <TextField size="small" label="Nome Fantasia" defaultValue={p?.fantasia ?? ''} sx={{ gridColumn: '1 / -1' }} />
        <TextField
          size="small" label={tipo === 'F' ? 'CPF' : 'CNPJ'} value={documento} onChange={(e) => setDocumento(e.target.value)}
          onBlur={() => { if (valido && !invalido) setDocumento(formatarDocumento(valido)); }}
          error={invalido} helperText={invalido ? `${tipo === 'F' ? 'CPF' : 'CNPJ'} inválido` : ' '} slotProps={{ htmlInput: { inputMode: 'numeric' } }}
        />
        <FormGroup row sx={{ alignItems: 'center', alignSelf: 'start' }}>
          {PAPEIS.map((x) => <FormControlLabel key={x.valor} label={x.rotulo} control={<Checkbox defaultChecked={p ? p.papeis.includes(x.valor) : x.valor === 'cliente'} />} />)}
        </FormGroup>
      </Box>
      <CamposGrade key={tipo} campos={tipo === 'F' ? CAMPOS_PF : CAMPOS_PJ} valores={valores} />
      <CamposGrade campos={CAMPOS_COMUNS} valores={valores} />
      <CamposGrade campos={ENDERECO} valores={valores} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
        <ListaItens titulo="Telefone(s)" botao="Adicionar Telefone" colunas={[{ rotulo: 'Descrição' }, { rotulo: 'Telefone' }]} inicial={p?.telefones} />
        <ListaItens titulo="E-mail(s)" botao="Adicionar E-mail" colunas={[{ rotulo: 'E-mail', largura: 200 }, { rotulo: 'Tipo', opcoes: TIPOS_EMAIL }]} inicial={p?.emails} />
      </Box>
    </Stack>
  );
}

function Indicadores({ pessoa }: { pessoa: PessoaExemplo | null }) {
  const titulos = pessoa?.titulos ?? [];
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2" fontWeight={700}>Resumo de Movimentações (Últimos 12 meses)</Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>{['Data', 'Documento', 'Valor', 'Descrição'].map((t) => <TableCell key={t} sx={{ fontWeight: 700 }}>{t}</TableCell>)}</TableRow>
          </TableHead>
          <TableBody>
            {titulos.map(([data, documento, valor, descricao]) => (
              <TableRow key={documento}>
                <TableCell>{data.split('-').reverse().join('/')}</TableCell>
                <TableCell>{documento}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{valor}</TableCell>
                <TableCell>{descricao}</TableCell>
              </TableRow>
            ))}
            {!titulos.length && <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Nenhuma movimentação.</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary">Os títulos virão do Financeiro.</Typography>
    </Stack>
  );
}

function Ficha({ pessoa: p }: { pessoa: PessoaExemplo | null }) {
  const [aba, setAba] = useState(ABAS[0]);
  const [salvo, setSalvo] = useState(false);
  const painel = (nome: string) => ({ hidden: aba !== nome, role: 'tabpanel' });

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Alert severity="info" sx={{ mb: 2 }}>{AVISO_DEMONSTRACAO}</Alert>
      <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} mb={1}>
        <Box>
          <Typography variant="h6" fontWeight={700}>{p ? p.nome : 'Novo cadastro'}</Typography>
          <Typography variant="body2" color="text.secondary">{p ? `Código ${p.codigo}${p.ativo ? '' : ' · Inativo'}` : 'O código é dado ao gravar.'}</Typography>
        </Box>
        <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={() => setSalvo(true)}>Salvar</Button>
      </Stack>

      <Tabs value={aba} onChange={(_e, valor: string) => setAba(valor)} variant="scrollable" scrollButtons="auto" aria-label="Abas do cadastro">
        {ABAS.map((a) => <Tab key={a} value={a} label={a} />)}
      </Tabs>
      {/* Todas as abas ficam montadas (só escondidas), para o que foi digitado não sumir ao trocar de aba. */}
      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mt: 1 }}>
        <Box {...painel('Principal')}><Principal pessoa={p} /></Box>
        <Box {...painel('Dados adicionais')}>
          <Stack spacing={3}>
            <CamposGrade campos={DADOS_ADICIONAIS} valores={p ? { Categoria: p.categoria } : {}} />
            <ListaItens titulo="CPFs/CNPJs autorizados para o download de documentos eletrônicos"
              colunas={[{ rotulo: 'Descrição' }, { rotulo: 'CPF/CNPJ' }, { rotulo: 'Tipo de documento autorizado' }]} />
          </Stack>
        </Box>
        <Box {...painel('Outros dados')}><CamposGrade campos={OUTROS_DADOS} /></Box>
        <Box {...painel('Ficha Complementar')}>
          <Stack spacing={3}>
            <CamposGrade campos={FICHA_COMPLEMENTAR} />
            <ListaItens titulo="Sócios" colunas={['Nome', 'CPF/CNPJ', 'RG', 'Data Nascimento', 'Telefone', 'Endereço', 'Cargo', 'Outras Rendas', 'Data Saída']
              .map((rotulo) => ({ rotulo, data: rotulo.startsWith('Data') ? true as const : undefined }))} />
            <ListaItens titulo="Dados Bancários" colunas={['Banco', 'Agência', 'Conta', 'Nome Titular', 'CPF/CNPJ Titular', 'Cartão', 'Limite', 'Chave Pix', 'Gerente',
              'Telefone', 'Obs.'].map((rotulo) => ({ rotulo }))} />
            <ListaItens titulo="Referência Comercial" colunas={[{ rotulo: 'Empresa' }, { rotulo: 'Telefone' }, { rotulo: 'Data Última Compra', data: true }, { rotulo: 'Observação' }]} />
            <ListaItens titulo="Bens/Imóveis" colunas={['Descrição', 'Modelo', 'Quantidade', 'Ano', 'Situação'].map((rotulo) => ({ rotulo }))} />
            <ListaItens titulo="Avalistas" colunas={[{ rotulo: 'Avalista' }]} />
            <ListaItens titulo="Procurações" colunas={[{ rotulo: 'Autorizado' }, { rotulo: 'Modelo' }, { rotulo: 'Data Emissão', data: true }, { rotulo: 'Validade', data: true }]} />
          </Stack>
        </Box>
        <Box {...painel('Veículos')}>
          <ListaItens titulo="Veículos" colunas={['Placa/Chassi', 'Modelo', 'Descrição', 'Ano Fab.'].map((rotulo) => ({ rotulo }))} />
        </Box>
        <Box {...painel('Ocorrências')}>
          <ListaItens titulo="Ocorrências" colunas={[{ rotulo: 'Data', data: true },
            { rotulo: 'Tipo de Ocorrência', opcoes: ['Registro', 'Alerta', 'Ocorrência', 'Observações O.S.', 'Observações Pedidos', 'Observações Expedições'] },
            { rotulo: 'Texto', largura: 300 }]} />
        </Box>
        <Box {...painel('Contatos')}>
          <ListaItens titulo="Contatos" colunas={['Descrição', 'Telefone', 'Celular', 'Email'].map((rotulo) => ({ rotulo }))} inicial={p?.contatos} />
        </Box>
        <Box {...painel('Arquivos')}>
          <ListaItens titulo="Arquivos" colunas={[{ rotulo: 'Título' }, { rotulo: 'Data', data: true }, { rotulo: 'Validade', data: true }, { rotulo: 'Tipo de Arquivo' }]} />
        </Box>
        <Box {...painel('Indicadores')}><Indicadores pessoa={p} /></Box>
      </Paper>

      <Snackbar open={salvo} autoHideDuration={4000} onClose={() => setSalvo(false)} message="Demonstração: nada foi gravado." />
    </Container>
  );
}

export default function ErpPessoaFichaPage() {
  const { codigo } = useParams();
  const navigate = useNavigate();
  const pessoa = pessoaExemplo(codigo);
  if (codigo !== 'novo' && !pessoa) {
    return (
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Alert severity="warning" action={<Button onClick={() => navigate('/erp/pessoas')}>Voltar à consulta</Button>}>Cadastro não encontrado.</Alert>
      </Container>
    );
  }
  // key: trocar de cadastro recomeça a ficha.
  return <Ficha key={codigo} pessoa={pessoa} />;
}
