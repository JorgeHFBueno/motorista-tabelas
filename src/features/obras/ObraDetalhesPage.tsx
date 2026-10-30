import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import {
  carregarAlocacoesDaObra,
  carregarAtividadesDaObra,
  carregarCombustivelDaObra,
  carregarMedicoesDaObra,
  carregarNomesMestres,
  carregarObra,
  gravarLocalObra,
} from './obrasData';
import {
  contratoTexto,
  dataCivilTexto,
  dataTexto,
  localPendente,
  obraFinalizada,
  periodosDosMestres,
  resumirCombustivel,
  veiculosNaObra,
  type ObraDetalhe,
  type PeriodoMestre,
  type ResumoCombustivel,
  type VeiculoNaObra,
} from './obrasDomain';
import { createObraRelatorioPdf, nomeArquivoRelatorioObra, type MedicoesObra, type Parte } from './obraRelatorioPdf';

// Detalhe da obra (obras-v2): todos os dados do contrato, só leitura, menos o local, que engenharia e adm2 gravam.

type Estado<T> = { status: 'carregando' } | Parte<T>;
const CARREGANDO = { status: 'carregando' } as const;
const dinheiro = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const litrosTexto = (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;

function parte<T>(promise: Promise<T>, set: (estado: Estado<T>) => void, ativo: () => boolean, rotulo: string) {
  promise
    .then((data) => { if (ativo()) set({ status: 'ok', data }); })
    .catch((err) => {
      console.error(`Erro ao carregar ${rotulo} da obra`, err);
      if (ativo()) set({ status: 'erro' });
    });
}

function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <Box minWidth={0}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{valor || '—'}</Typography>
    </Box>
  );
}

function Secao<T>({ titulo, estado, erro, children }: { titulo: string; estado: Estado<T>; erro: string; children: (data: T) => ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>{titulo}</Typography>
      {estado.status === 'carregando' ? (
        <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
      ) : estado.status === 'erro' ? (
        <Alert severity="error">{erro}</Alert>
      ) : children(estado.data)}
    </Paper>
  );
}

function Tabela({ cabecalho, linhas, direita = [], maxHeight }: { cabecalho: string[]; linhas: ReactNode[][]; direita?: number[]; maxHeight?: number }) {
  return (
    <TableContainer sx={{ maxHeight }}>
      <Table size="small" stickyHeader={Boolean(maxHeight)}>
        <TableHead>
          <TableRow>{cabecalho.map((titulo, index) => <TableCell key={titulo} align={direita.includes(index) ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{titulo}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {linhas.map((linha, row) => (
            <TableRow key={row}>{linha.map((celula, index) => <TableCell key={index} align={direita.includes(index) ? 'right' : 'left'}>{celula}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

const Vazio = ({ children }: { children: ReactNode }) => <Typography color="text.secondary">{children}</Typography>;

export default function ObraDetalhesPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [obra, setObra] = useState<ObraDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [medicoes, setMedicoes] = useState<Estado<MedicoesObra>>(CARREGANDO);
  const [mestres, setMestres] = useState<Estado<PeriodoMestre[]>>(CARREGANDO);
  const [veiculos, setVeiculos] = useState<Estado<VeiculoNaObra[]>>(CARREGANDO);
  const [combustivel, setCombustivel] = useState<Estado<ResumoCombustivel>>(CARREGANDO);
  const [localEditado, setLocalEditado] = useState<string | null>(null); // null = fora da edição
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({ open: false, severity: 'success', message: '' });

  useEffect(() => {
    let active = true;
    const ativo = () => active;
    carregarObra(id)
      .then((encontrada) => {
        if (!active) return;
        if (!encontrada) { setError('Obra não encontrada.'); return; }
        setObra(encontrada);
        if (encontrada.subcentroErp) parte(carregarMedicoesDaObra(encontrada.id, encontrada.subcentroErp), setMedicoes, ativo, 'medições');
        else setMedicoes({ status: 'ok', data: { snapshot: null, atualizadoAgora: false } });
        parte(
          Promise.all([carregarAlocacoesDaObra(encontrada.id), carregarNomesMestres()])
            .then(([alocacoes, nomes]) => periodosDosMestres(alocacoes, nomes, encontrada.nomesLotes)),
          setMestres, ativo, 'mestres',
        );
        parte(carregarAtividadesDaObra(encontrada.id).then(veiculosNaObra), setVeiculos, ativo, 'veículos');
        parte(carregarCombustivelDaObra(encontrada.id).then(resumirCombustivel), setCombustivel, ativo, 'combustível');
      })
      .catch((err) => {
        console.error('Erro ao carregar a obra', err);
        if (active) setError('Não foi possível carregar a obra. Tente novamente.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function salvarLocal() {
    if (!obra || localEditado === null) return;
    setSalvandoLocal(true);
    try {
      const local = await gravarLocalObra(obra.id, localEditado);
      setObra({ ...obra, local });
      setLocalEditado(null);
      setSnackbar({ open: true, severity: 'success', message: 'Local salvo.' });
    } catch (err) {
      console.error('Erro ao salvar o local da obra', err);
      setSnackbar({ open: true, severity: 'error', message: 'Não foi possível salvar o local. Tente novamente.' });
    } finally {
      setSalvandoLocal(false);
    }
  }

  const partes = [medicoes, mestres, veiculos, combustivel];
  const carregandoPartes = partes.some((item) => item.status === 'carregando');

  function gerarRelatorio() {
    if (!obra || carregandoPartes) return;
    setGerando(true);
    try {
      const geradoEm = new Date();
      const file = createObraRelatorioPdf({
        obra, geradoEm,
        medicoes: medicoes as Parte<MedicoesObra>,
        mestres: mestres as Parte<PeriodoMestre[]>,
        veiculos: veiculos as Parte<VeiculoNaObra[]>,
        combustivel: combustivel as Parte<ResumoCombustivel>,
      });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = nomeArquivoRelatorioObra(obra, geradoEm);
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('Erro ao gerar o relatório da obra', err);
      setSnackbar({ open: true, severity: 'error', message: 'Não foi possível gerar o relatório.' });
    } finally {
      setGerando(false);
    }
  }

  if (loading) {
    return <Container sx={{ py: 4 }}><Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box></Container>;
  }

  if (error || !obra) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error ?? 'Obra não encontrada.'}</Alert>
        <Button variant="outlined" onClick={() => navigate('/engenharia/obras')}>Voltar para Obras</Button>
      </Container>
    );
  }

  const semLocal = localPendente(obra.local);

  return (
    <Container sx={{ py: 4 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems="center">
        <Typography variant="h4">Detalhes da Obra</Typography>
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={() => navigate('/engenharia/obras')}>Voltar para Obras</Button>
          <Button variant="contained" onClick={gerarRelatorio} disabled={carregandoPartes || gerando}>
            {carregandoPartes ? 'Carregando dados...' : 'Gerar Relatório'}
          </Button>
        </Stack>
      </Stack>

      <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: 700 }}>{obra.nomeObra}</Typography>
          {obra.situacao && <Chip label={obra.situacao} size="small" variant="outlined" />}
          {obraFinalizada(obra) && <Chip label="Finalizada" size="small" />}
        </Stack>

        <Box sx={{ mt: 2 }}>
          <Typography variant="body2" color="text.secondary">Local</Typography>
          {localEditado === null ? (
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography sx={{ fontSize: { xs: 18, sm: 22 }, fontWeight: 600 }} color={semLocal ? 'warning.dark' : 'text.primary'}>
                {semLocal ? 'Local a corrigir' : obra.local}
              </Typography>
              {semLocal ? (
                <Button size="small" variant="contained" onClick={() => setLocalEditado('')}>Cadastrar local</Button>
              ) : (
                <Tooltip title="Editar local">
                  <IconButton size="small" aria-label="Editar local" onClick={() => setLocalEditado(obra.local)}>
                    <EditOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          ) : (
            <Stack
              component="form"
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              alignItems={{ sm: 'center' }}
              sx={{ mt: 1, maxWidth: 640 }}
              onSubmit={(event) => { event.preventDefault(); void salvarLocal(); }}
            >
              <TextField
                size="small"
                label="Local"
                placeholder="Ex.: Lagoa Bonita do Sul - RS"
                value={localEditado}
                onChange={(event) => setLocalEditado(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setLocalEditado(null); }}
                autoFocus
                fullWidth
                disabled={salvandoLocal}
                slotProps={{ htmlInput: { maxLength: 200 } }}
              />
              <Stack direction="row" spacing={1}>
                <Button type="submit" variant="contained" disabled={salvandoLocal || !localEditado.trim() || localEditado.trim() === obra.local}>Salvar</Button>
                <Button variant="outlined" onClick={() => setLocalEditado(null)} disabled={salvandoLocal}>Cancelar</Button>
              </Stack>
            </Stack>
          )}
        </Box>

        <Box sx={{ mt: 2.5, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
          <Campo rotulo="Contrato" valor={contratoTexto(obra)} />
          <Campo rotulo="Empresa" valor={obra.empresa} />
          <Campo rotulo="Tipo de obra" valor={obra.tipoObra} />
          <Campo rotulo="Status no sistema" valor={obra.status} />
          <Campo rotulo="Início do contrato" valor={dataCivilTexto(obra.dataInicial)} />
          <Campo rotulo="Fim do contrato" valor={dataCivilTexto(obra.dataFinal)} />
          <Campo rotulo="Ordem de início" valor={obra.ordemInicio} />
          <Campo rotulo="Confirmação de recurso" valor={obra.confirmacaoRecurso} />
          <Campo rotulo="Subcentro ERP" valor={obra.subcentroErp} />
          <Campo rotulo="Sigla" valor={obra.siglaObra} />
          <Campo rotulo="Código" valor={obra.codObra ? String(obra.codObra) : ''} />
          <Campo rotulo="Ano" valor={obra.ano ? String(obra.ano) : ''} />
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5, mb: 1 }}>LOTEs</Typography>
        {obra.lotes.length ? (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {obra.lotes.map((lote) => <Chip key={lote.chave} label={lote.status ? `${lote.nome} · ${lote.status}` : lote.nome} variant="outlined" />)}
          </Stack>
        ) : <Vazio>Sem LOTEs cadastrados.</Vazio>}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          O cadastro da obra é feito no Friday (quadro GESTÃO DE OBRAS); aqui só o local pode ser editado.
        </Typography>
      </Paper>

      <Secao titulo="Saldo do contrato / medições" estado={medicoes} erro="Não foi possível consultar as medições.">
        {({ snapshot, atualizadoAgora }) => !obra.subcentroErp ? (
          <Vazio>Não há Subcentro ERP vinculado: as medições não podem ser consultadas.</Vazio>
        ) : (
          <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
              <Campo rotulo="Medições" valor={snapshot ? dinheiro.format(snapshot.valor_bruto_servico) : 'Sem medições'} />
              <Campo rotulo="Notas de medição" valor={snapshot ? String(snapshot.qtd_notas) : ''} />
              <Campo rotulo="Total do contrato" valor="Não informado" />
              <Campo rotulo="Saldo do contrato" valor="Não informado" />
            </Box>
            <Typography variant="caption" color={atualizadoAgora ? 'text.secondary' : 'warning.dark'} sx={{ display: 'block', mt: 1.5 }}>
              {atualizadoAgora ? 'Medições do ERP (Query 55), consultadas agora.' : 'O ERP não respondeu: valores da última consulta salva.'}
            </Typography>
          </>
        )}
      </Secao>

      <Secao titulo="Mestres alocados" estado={mestres} erro="Não foi possível carregar as alocações do CronoObra.">
        {(itens) => itens.length ? (
          <Tabela
            cabecalho={['Mestre', 'LOTE', 'Início', 'Fim', 'Dias']}
            direita={[4]}
            linhas={itens.map((item) => [item.mestre, item.lote, dataCivilTexto(item.inicio), dataCivilTexto(item.fim), item.dias])}
          />
        ) : <Vazio>Nenhum mestre alocado no CronoObra.</Vazio>}
      </Secao>

      <Secao titulo="Veículos que foram para a obra" estado={veiculos} erro="Não foi possível carregar as atividades.">
        {(itens) => itens.length ? (
          <Tabela
            cabecalho={['Veículo', 'Atividades', 'Primeira', 'Última', 'Motoristas']}
            direita={[1]}
            linhas={itens.map((item) => [[item.placa, item.nome].filter(Boolean).join(' — '), item.atividades, dataTexto(item.primeira), dataTexto(item.ultima), item.motoristas.join(', ')])}
          />
        ) : <Vazio>Nenhuma atividade registrada para esta obra.</Vazio>}
      </Secao>

      <Secao titulo="Combustível" estado={combustivel} erro="Não foi possível carregar o combustível.">
        {(resumo) => resumo.abastecimentos ? (
          <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' }, mb: 2 }}>
              <Campo rotulo="Abastecimentos" valor={String(resumo.abastecimentos)} />
              <Campo rotulo="Litros" valor={litrosTexto(resumo.litros)} />
              <Campo rotulo="Valor" valor={dinheiro.format(resumo.valor)} />
            </Box>
            <Tabela
              cabecalho={['Veículo', 'Abastecimentos', 'Litros', 'Valor']}
              direita={[1, 2, 3]}
              linhas={resumo.porVeiculo.map((item) => [item.veiculo, item.abastecimentos, litrosTexto(item.litros), dinheiro.format(item.valor)])}
            />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5, mb: 1 }}>Abastecimentos</Typography>
            <Tabela
              maxHeight={360}
              cabecalho={['Data', 'Veículo', 'Litros', 'Valor', 'Para quem']}
              direita={[2, 3]}
              linhas={resumo.itens.map((item) => [dataTexto(item.data), item.veiculo, litrosTexto(item.litros), dinheiro.format(item.valor), item.paraQuem || '—'])}
            />
          </>
        ) : <Vazio>Nenhum abastecimento registrado para esta obra.</Vazio>}
      </Secao>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))} severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Container>
  );
}
