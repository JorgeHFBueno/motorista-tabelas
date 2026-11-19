import {
  Alert, Autocomplete, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Stack, TextField,
  ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { itemFrotaLabel, type ItemFrotaV2 } from '../../utils/cadastrosV2';
import { listarVeiculosChecklist } from '../checklist-mecanico/data/checklistFirestore';
import PaginaMotorista from '../saida-chegada/components/PaginaMotorista';
import { enviador, useFilaRevisao } from './data/filaEnvio';
import { LIMITE_HISTORICO, listarRevisoes } from './data/revisaoFirestore';
import type { RevisaoLida } from './domain/documento';
import { tituloDe, TIPOS } from './domain/listas';
import { estaAberta, horimetroDe, naoEnviada, type RevisaoPendente, type RevisaoRegistro } from './domain/registro';
import ChipStatus from './components/ChipStatus';
import { resumoDoItem, textoDatas, textoItens } from './domain/regras';

type Situacao = 'todas' | 'abertas' | 'fechadas';
const SITUACOES: { id: Situacao; titulo: string }[] = [
  { id: 'todas', titulo: 'Todas' },
  { id: 'abertas', titulo: 'Em manutenção' },
  { id: 'fechadas', titulo: 'Fechadas' },
];
const aceita = (s: Situacao, r: RevisaoRegistro) => s === 'todas' || (s === 'abertas') === estaAberta(r);
const medidor = (r: RevisaoRegistro) => `${horimetroDe(r.veiculo) ? 'Horímetro' : 'KM'} ${r.medidor?.toLocaleString('pt-BR') ?? '-'}`;

/**
 * /motorista/revisao/historico: todos os registros (de qualquer mecânico), com filtro por veículo e situação; filtrado
 * por um veículo, vira a linha do tempo dele. No topo, as revisões deste aparelho ainda não enviadas.
 */
export default function RevisaoHistoricoPage() {
  const navigate = useNavigate();
  const fila = useFilaRevisao();
  const [veiculos, setVeiculos] = useState<ItemFrotaV2[] | null>(null);
  const [veiculo, setVeiculo] = useState<ItemFrotaV2 | null>(null);
  const [situacao, setSituacao] = useState<Situacao>('todas');
  const [pendentes, setPendentes] = useState<RevisaoPendente[]>([]);
  const [lista, setLista] = useState<RevisaoLida[] | null>(null);
  const [erro, setErro] = useState(false);
  const veiculoId = veiculo?.id ?? null;

  useEffect(() => {
    listarVeiculosChecklist().then(setVeiculos).catch((error) => console.warn('Revisão: sem a lista de veículos', error));
  }, []);

  const carregar = useCallback(async () => {
    setErro(false);
    setLista(null);
    try {
      setLista(await listarRevisoes(veiculoId));
    } catch (error) {
      console.error('Revisão: falha ao carregar o histórico', error);
      setErro(true);
    }
  }, [veiculoId]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Os pendentes mudam com a fila: um enviado sai do topo e aparece na lista.
  const anterior = useRef(fila.pendentes);
  useEffect(() => {
    void enviador.pendentesDoUsuario().then(setPendentes);
    if (fila.pendentes < anterior.current) void carregar();
    anterior.current = fila.pendentes;
  }, [fila.pendentes, fila.naoEnviadas, carregar]);

  const daTela = pendentes.filter((p) => (veiculoId == null || p.registro.veiculo.id === veiculoId) && aceita(situacao, p.registro));
  const aguardando = new Set(daTela.filter((p) => p.recusa == null).map((p) => p.registro.id));
  const enviadas = lista?.filter((l) => aceita(situacao, l.registro)) ?? null;

  return (
    <PaginaMotorista>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2 }}>Histórico de revisões</Typography>
      <Stack spacing={1.5}>
        <Autocomplete
          options={veiculos ?? []}
          value={veiculo}
          onChange={(_, v) => setVeiculo(v)}
          getOptionLabel={itemFrotaLabel}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText="Nenhum veículo encontrado"
          renderInput={(params) => <TextField {...params} label="Veículo / Máquina" placeholder={`Todos (os ${LIMITE_HISTORICO} mais recentes)`} slotProps={{ inputLabel: { shrink: true } }} />}
        />
        <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={situacao} onChange={(_, s: Situacao | null) => { if (s) setSituacao(s); }}>
          {SITUACOES.map((s) => <ToggleButton key={s.id} value={s.id} sx={{ textTransform: 'none' }}>{s.titulo}</ToggleButton>)}
        </ToggleButtonGroup>
        {veiculo && enviadas && enviadas.length > 0 && <Typography variant="h6">Linha do tempo de {veiculo.identificador}</Typography>}
        {daTela.map((p) => <CartaoPendente key={p.registro.id} pendente={p} />)}
        {erro && (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void carregar()}>Tentar de novo</Button>}>
            Não foi possível carregar o histórico.
          </Alert>
        )}
        {!erro && enviadas == null && <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>}
        {enviadas?.length === 0 && daTela.length === 0 && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Nenhuma revisão encontrada.</Typography>}
        {enviadas?.map((l) => {
          const r = l.registro;
          return (
            <Card key={r.id} variant="outlined">
              <CardActionArea onClick={() => navigate(`/motorista/revisao/historico/${encodeURIComponent(r.id)}`)}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Typography fontWeight={700}>{r.veiculo.identificador} · {tituloDe(TIPOS, r.tipo) ?? '-'}</Typography>
                    <ChipStatus registro={r} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {[textoDatas(r), medidor(r), textoItens(r.itens.length), l.criadoPorNome ? `por ${l.criadoPorNome}` : null].filter(Boolean).join(' · ')}
                  </Typography>
                  {r.motivo.trim() && <Typography variant="body2" color="text.secondary">{r.motivo.trim()}</Typography>}
                  {aguardando.has(r.id) && <Typography variant="body2" color="warning.dark">Há alterações deste aparelho aguardando envio.</Typography>}
                  {veiculo && r.itens.map((i) => <Typography key={i.itemId} variant="body2">• {resumoDoItem(i)}</Typography>)}
                </CardContent>
              </CardActionArea>
            </Card>
          );
        })}
      </Stack>
    </PaginaMotorista>
  );
}

function CartaoPendente({ pendente: p }: { pendente: RevisaoPendente }) {
  const r = p.registro;
  const falhou = naoEnviada(p);
  return (
    <Card variant="outlined" sx={{ borderColor: falhou ? 'error.main' : 'warning.main' }}>
      <CardContent>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          {falhou ? <ErrorOutlineRoundedIcon color="error" /> : <CloudUploadOutlinedIcon color="warning" />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography fontWeight={700}>{r.veiculo.identificador} · {tituloDe(TIPOS, r.tipo) ?? '-'}</Typography>
            <Typography variant="body2" color="text.secondary">{[textoDatas(r), textoItens(r.itens.length)].join(' · ')}</Typography>
            {(p.recusa ?? p.aviso) && <Typography variant="body2" color="error">{p.recusa ?? p.aviso}</Typography>}
          </Box>
          {!falhou && <Chip size="small" color="warning" label="Aguardando envio" />}
        </Stack>
      </CardContent>
    </Card>
  );
}
