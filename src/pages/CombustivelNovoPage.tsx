import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { listObrasAtivas } from '../services/obras.service';
import { listVeiculosAtivos } from '../services/veiculos.service';
import { listFuncionariosAtivos } from '../services/funcionarios-selecao.service';
import { listMotivosCombustivelAtivos } from '../services/motivos.service';
import { carregarContextoLancamento, salvarLancamento, type ContextoLancamento } from '../services/combustivelFirestore';
import { itemFrotaLabel, obraLabel, temPerfil, type ItemFrotaV2, type ObraV2, type PessoaV2 } from '../utils/cadastrosV2';
import {
  encadearLinhas,
  totalLinhas,
  validarLote,
  type LinhaLancamento,
  type Medidor,
  type PlanoLancamento,
} from '../utils/combustivelLancamento';
import { formatarLitrosX10, parseDigitosX10, parseLitrosPtBr } from '../utils/formatters';

// Lançamento de saídas V2 pelo responsável (The Manuscript, 02_PROCESSOS/combustivel-saida-v2.md, "Lançamento pela WEB").
interface LinhaForm {
  key: number;
  data: string;
  item: ItemFrotaV2 | null;
  obra: ObraV2 | null;
  frentista: PessoaV2 | null;
  operador: PessoaV2 | string | null;
  modalidade: 'direto' | 'galao';
  medidor: string;
  semOdometro: boolean;
  quantidade: number | null;
  arla: string;
  motivo: string;
  observacao: string;
}

const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

let proximaChave = 1;
function novaLinha(data: string, frentista: PessoaV2 | null): LinhaForm {
  return {
    key: proximaChave++, data, item: null, obra: null, frentista, operador: null, modalidade: 'direto', medidor: '', semOdometro: false,
    quantidade: null, arla: '0', motivo: '', observacao: '',
  };
}

function medidorDe(linha: LinhaForm): Medidor {
  if (linha.modalidade === 'galao') return null;
  if (linha.semOdometro) return 'sem-odometro';
  const digits = linha.medidor.replace(/\D/g, '');
  if (!digits) return null;
  return { tipo: linha.item?.categoria === 'EXTRA' ? 'horimetro' : 'quilometragem', valor: Number(digits) };
}

function paraLancamento(linha: LinhaForm): LinhaLancamento {
  const operador = typeof linha.operador === 'string'
    ? (linha.operador.trim() ? { uid: null, nome: linha.operador.trim() } : null)
    : linha.operador ? { uid: linha.operador.uid, nome: linha.operador.nome } : null;
  return {
    data: new Date(linha.data),
    quantidade: linha.quantidade,
    arla: parseLitrosPtBr(linha.arla) ?? -1,
    modalidade: linha.modalidade,
    item: linha.item,
    obra: linha.obra,
    frentista: linha.frentista ? { uid: linha.frentista.uid, nome: linha.frentista.nome } : null,
    motoristaOperador: operador,
    motivo: linha.motivo,
    observacao: linha.observacao,
    medidor: medidorDe(linha),
  };
}

function ResumoPlano({ plano, explicado }: { plano: PlanoLancamento; explicado: number }) {
  if (plano.modo === 'atual') {
    return (
      <Alert severity="info">
        <strong>Lançamento atual</strong>: depois do último registro{plano.desde ? ` (${dataHora.format(plano.desde)})` : ''}.
        Parte do montante {formatarLitrosX10(plano.montantePartida)} e do estoque {formatarLitrosX10(plano.estoquePartida)} da bomba, e atualiza a bomba.
      </Alert>
    );
  }
  const falta = plano.furo - explicado;
  return (
    <Alert severity={falta < 0 ? 'error' : 'warning'}>
      <strong>Correção de furo</strong> entre {dataHora.format(plano.desde)} e {dataHora.format(plano.ate)}: furo de {formatarLitrosX10(plano.furo)},
      a partir do montante {formatarLitrosX10(plano.montantePartida)}.{' '}
      {plano.ajuste
        ? 'Coberto pelo ajuste automático: os abastecimentos tomam o lugar dele (o que sobrar continua como ajuste) e o estoque não muda.'
        : 'Sem ajuste automático: o total será descontado do estoque atual.'}
      {' '}O montante atual e o último abastecimento da bomba não mudam.
      <br />Explicado: {formatarLitrosX10(explicado)} · Falta: {formatarLitrosX10(falta)}
    </Alert>
  );
}

export default function CombustivelNovoPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [vehicles, setVehicles] = useState<ItemFrotaV2[]>([]);
  const [obras, setObras] = useState<ObraV2[]>([]);
  const [pessoas, setPessoas] = useState<PessoaV2[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [dataReferencia, setDataReferencia] = useState(localInput(new Date()));
  const [contexto, setContexto] = useState<ContextoLancamento | null>(null);
  const [linhas, setLinhas] = useState<LinhaForm[]>([]);
  const [verificando, setVerificando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [erros, setErros] = useState<string[]>([]);

  useEffect(() => {
    void Promise.all([listVeiculosAtivos(), listObrasAtivas(), listFuncionariosAtivos(), listMotivosCombustivelAtivos()])
      .then(([v, o, p, m]) => { setVehicles(v); setObras(o); setPessoas(p); setMotivos(m); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Falha ao carregar opções.'));
  }, []);

  const frentistas = useMemo(() => pessoas.filter((p) => temPerfil(p, 'frentista', 'adm2')), [pessoas]);
  const motoristas = useMemo(() => pessoas.filter((p) => temPerfil(p, 'motorista')), [pessoas]);
  const eu = useMemo(() => pessoas.find((p) => p.uid === currentUser?.uid) ?? null, [pessoas, currentUser?.uid]);
  const plano = contexto && !('erro' in contexto.plano) ? contexto.plano : null;
  const lancamentos = useMemo(() => linhas.map(paraLancamento), [linhas]);
  const explicado = totalLinhas(lancamentos);
  const cadeia = useMemo(() => (plano ? encadearLinhas(lancamentos.filter((l) => !Number.isNaN(l.data.getTime())), plano.montantePartida, plano.estoquePartida) : []), [lancamentos, plano]);

  const verificar = async () => {
    setError(''); setErros([]); setContexto(null);
    const data = new Date(dataReferencia);
    if (Number.isNaN(data.getTime())) return setError('Data inválida.');
    try {
      setVerificando(true);
      const novo = await carregarContextoLancamento(data);
      setContexto(novo);
      const padrao = eu && temPerfil(eu, 'frentista', 'adm2') ? eu : null;
      setLinhas((atuais) => (atuais.length ? atuais : [novaLinha(dataReferencia, padrao)]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível ler os registros dessa data.');
    } finally {
      setVerificando(false);
    }
  };

  const alterar = (key: number, patch: Partial<LinhaForm>) => setLinhas((atuais) => atuais.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!plano || !contexto) return setError('Verifique a data antes de salvar.');
    if (!eu) return setError('Seu cadastro em funcionarios não foi encontrado ou está inativo.');
    const lista = validarLote(plano, lancamentos, new Date(), contexto.folgaLitros);
    setErros(lista);
    if (lista.length) return;
    try {
      setSaving(true);
      await salvarLancamento({ plano, linhas: lancamentos, criadoPor: { uid: eu.uid, nome: eu.nome }, precosEntradas: contexto.precosEntradas });
      navigate('/combustivel');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack component="form" onSubmit={submit} spacing={2} sx={{ p: 2, maxWidth: 1100 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">Lançamento de combustível</Typography>
        <Button onClick={() => navigate('/combustivel')}>Voltar</Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          <TextField
            label="Data do abastecimento"
            type="datetime-local"
            value={dataReferencia}
            onChange={(e) => { setDataReferencia(e.target.value); setContexto(null); }}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="outlined" onClick={() => void verificar()} disabled={verificando}>
            {verificando ? 'Verificando...' : 'Verificar data'}
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Depois do último registro, é um lançamento atual. Entre dois registros, é a correção de um furo, que pode ter vários abastecimentos.
        </Typography>
      </Paper>

      {contexto && 'erro' in contexto.plano && <Alert severity="error">{contexto.plano.erro}</Alert>}
      {plano && <ResumoPlano plano={plano} explicado={explicado} />}
      {plano && plano.modo === 'correcao' && !contexto?.precosEntradas.length && (
        <Alert severity="info">Nenhuma entrada de diesel V2 com preço: as saídas ficam com valor R$ 0,00.</Alert>
      )}

      {plano && linhas.map((linha, index) => {
        const isVehicle = linha.item?.categoria !== 'EXTRA';
        return (
          <Paper key={linha.key} sx={{ p: 2 }}>
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle1">Abastecimento {index + 1}</Typography>
                {linhas.length > 1 && (
                  <Tooltip title="Remover">
                    <IconButton onClick={() => setLinhas((atuais) => atuais.filter((l) => l.key !== linha.key))}><DeleteOutlineIcon /></IconButton>
                  </Tooltip>
                )}
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField label="Data" type="datetime-local" value={linha.data} onChange={(e) => alterar(linha.key, { data: e.target.value })} InputLabelProps={{ shrink: true }} />
                <Autocomplete options={vehicles} value={linha.item} onChange={(_, v) => alterar(linha.key, { item: v, medidor: '', semOdometro: false })} getOptionLabel={itemFrotaLabel} isOptionEqualToValue={(a, b) => a.id === b.id} renderInput={(p) => <TextField {...p} label="Item da frota" required />} fullWidth />
                <Autocomplete options={obras} value={linha.obra} onChange={(_, v) => alterar(linha.key, { obra: v })} getOptionLabel={obraLabel} isOptionEqualToValue={(a, b) => a.id === b.id} renderInput={(p) => <TextField {...p} label="Obra" required />} fullWidth />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Autocomplete options={frentistas} value={linha.frentista} onChange={(_, v) => alterar(linha.key, { frentista: v })} getOptionLabel={(p) => p.nome} isOptionEqualToValue={(a, b) => a.uid === b.uid} renderInput={(p) => <TextField {...p} label="Frentista" required />} fullWidth />
                <Autocomplete
                  freeSolo
                  options={motoristas}
                  value={linha.operador}
                  onChange={(_, v) => alterar(linha.key, { operador: v })}
                  onInputChange={(_, texto, reason) => { if (reason === 'input') alterar(linha.key, { operador: texto }); }}
                  getOptionLabel={(p) => (typeof p === 'string' ? p : p.nome)}
                  isOptionEqualToValue={(a, b) => typeof a !== 'string' && typeof b !== 'string' && a.uid === b.uid}
                  renderInput={(p) => <TextField {...p} label="Motorista/operador" helperText="Nome digitado fica sem UID" required />}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
                <FormControl sx={{ minWidth: 160 }}>
                  <InputLabel>Modalidade</InputLabel>
                  <Select value={linha.modalidade} label="Modalidade" onChange={(e) => alterar(linha.key, { modalidade: e.target.value as 'direto' | 'galao' })}>
                    <MenuItem value="direto">Direto</MenuItem>
                    <MenuItem value="galao">Galão</MenuItem>
                  </Select>
                </FormControl>
                {linha.modalidade === 'direto' && (
                  <>
                    <TextField
                      label={isVehicle ? 'KM' : 'Horímetro'}
                      value={linha.medidor}
                      onChange={(e) => alterar(linha.key, { medidor: e.target.value.replace(/\D/g, '') })}
                      disabled={linha.semOdometro}
                      helperText={plano.modo === 'atual' && linha.item?.quilometragemUltima != null ? `Último: ${linha.item.quilometragemUltima}` : undefined}
                      inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                    />
                    <FormControlLabel control={<Checkbox checked={linha.semOdometro} onChange={(e) => alterar(linha.key, { semOdometro: e.target.checked, medidor: '' })} />} label="Sem odômetro" />
                  </>
                )}
                <TextField
                  label="Quantidade"
                  value={linha.quantidade === null ? '' : String(linha.quantidade)}
                  onChange={(e) => alterar(linha.key, { quantidade: parseDigitosX10(e.target.value) })}
                  helperText={linha.quantidade === null ? 'Dígitos da bomba (×10)' : formatarLitrosX10(linha.quantidade)}
                  inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                  required
                />
                <TextField label="ARLA (L)" value={linha.arla} onChange={(e) => alterar(linha.key, { arla: e.target.value })} inputProps={{ inputMode: 'decimal' }} />
              </Stack>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <Autocomplete freeSolo options={motivos} value={linha.motivo} onInputChange={(_, v) => alterar(linha.key, { motivo: v })} renderInput={(p) => <TextField {...p} label="Motivo" required />} fullWidth />
                <TextField label="Observação" value={linha.observacao} onChange={(e) => alterar(linha.key, { observacao: e.target.value })} fullWidth />
              </Stack>
            </Stack>
          </Paper>
        );
      })}

      {plano && (
        <Box>
          <Button onClick={() => setLinhas((atuais) => [...atuais, novaLinha(atuais[atuais.length - 1]?.data ?? dataReferencia, eu && temPerfil(eu, 'frentista', 'adm2') ? eu : null)])}>
            Adicionar abastecimento
          </Button>
        </Box>
      )}

      {plano && cadeia.length > 0 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Montantes encadeados (em ordem de data)</Typography>
          {cadeia.map((passo, index) => (
            <Typography key={index} variant="body2">
              {Number.isNaN(passo.linha.data.getTime()) ? '—' : dataHora.format(passo.linha.data)} · {passo.linha.item ? itemFrotaLabel(passo.linha.item) : 'sem item'} ·
              montante {formatarLitrosX10(passo.montanteAntes)} → {formatarLitrosX10(passo.montanteAposMovimento)}
            </Typography>
          ))}
        </Paper>
      )}

      {erros.length > 0 && <Alert severity="error">{erros.map((e) => <div key={e}>{e}</div>)}</Alert>}
      {plano && (
        <Button type="submit" variant="contained" disabled={saving}>
          {saving ? 'Salvando...' : `Salvar ${linhas.length > 1 ? `${linhas.length} abastecimentos` : 'abastecimento'}`}
        </Button>
      )}
    </Stack>
  );
}
