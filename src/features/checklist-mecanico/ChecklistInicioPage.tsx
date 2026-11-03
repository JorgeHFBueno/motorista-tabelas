import {
  Alert, Autocomplete, Box, Button, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, LinearProgress, Snackbar, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup,
  Typography,
} from '@mui/material';
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded';
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { itemFrotaLabel, type ItemFrotaV2 } from '../../utils/cadastrosV2';
import { catalogoParaCategoria, type CatalogoId } from './domain/catalogo';
import { novoRascunho, type ChecklistMotorista, type ChecklistRascunho, type ChecklistTipo } from './domain/rascunho';
import { aplicarNaoSeAplicaLembrados, medidorAbaixoDoUltimo, progresso, validarMedidor } from './domain/regras';
import { carregarRascunho, descartarRascunho, salvarRascunho } from './data/armazenamentoLocal';
import {
  checklistVeiculoDe, listarMotoristasChecklist, listarVeiculosChecklist, naoSeAplicaDoUltimoChecklist,
} from './data/checklistFirestore';
import { enviador, useFilaEnvio } from './data/filaEnvio';
import MedidorCampo from './components/MedidorCampo';
import MotoristaCampo from './components/MotoristaCampo';
import InstalarNoIphone from './components/InstalarNoIphone';

type Inicio =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'rascunho'; rascunho: ChecklistRascunho }
  | { estado: 'novo'; veiculos: ItemFrotaV2[]; motoristas: ChecklistMotorista[] };

const botaoGrande = { minHeight: 52, fontSize: 16, fontWeight: 700, textTransform: 'none' } as const;

/** /checklist: começa um checklist ou retoma o rascunho em andamento (um por vez), como no app. */
export default function ChecklistInicioPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [inicio, setInicio] = useState<Inicio>({ estado: 'carregando' });
  const fila = useFilaEnvio();
  // Aviso deixado pela tela de itens ao concluir ("O envio continua em seguida").
  const [aviso, setAviso] = useState<string | null>(() => (location.state as { aviso?: string } | null)?.aviso ?? null);

  const carregar = useCallback(async () => {
    setInicio({ estado: 'carregando' });
    try {
      const rascunho = await carregarRascunho();
      if (rascunho) {
        setInicio({ estado: 'rascunho', rascunho });
        return;
      }
      // Sem a lista de motoristas (sem conexão), o nome pode ser digitado.
      const motoristas = listarMotoristasChecklist().catch((error) => {
        console.warn('Checklist: sem a lista de motoristas', error);
        return [] as ChecklistMotorista[];
      });
      setInicio({ estado: 'novo', veiculos: await listarVeiculosChecklist(), motoristas: await motoristas });
    } catch (error) {
      console.error('Checklist: falha ao carregar', error);
      setInicio({ estado: 'erro' });
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  // O aviso vem uma vez: recarregar a página não o mostra de novo.
  useEffect(() => {
    if ((location.state as { aviso?: string } | null)?.aviso) navigate('/checklist', { replace: true, state: null });
  }, [location.state, navigate]);

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', px: 2, py: 2, pb: 6 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>Checklist</Typography>
        <Button variant="outlined" startIcon={<HistoryRoundedIcon />} onClick={() => navigate('/checklist/historico')}>Histórico</Button>
      </Stack>
      <InstalarNoIphone />
      {fila.pendentes > 0 && (
        <Alert
          severity={fila.enviando ? 'info' : 'warning'}
          sx={{ mb: 2 }}
          action={fila.enviando
            ? <CircularProgress size={20} sx={{ mt: 0.5, mr: 1 }} />
            : <Button color="inherit" size="small" onClick={() => void enviador.enviarPendentes({ forcar: true })}>Enviar agora</Button>}
        >
          <Typography fontWeight={700}>{fila.pendentes === 1 ? '1 checklist aguardando envio' : `${fila.pendentes} checklists aguardando envio`}</Typography>
          <Typography variant="body2">
            {fila.progresso ? `Enviando ${fila.progresso.enviados} de ${fila.progresso.total} arquivos. ` : ''}
            Mantenha o app aberto até terminar.
          </Typography>
        </Alert>
      )}
      {inicio.estado === 'carregando' && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack>}
      {inicio.estado === 'erro' && (
        <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
          <Typography>Não foi possível carregar os veículos.</Typography>
          <Button variant="outlined" onClick={() => void carregar()}>Tentar de novo</Button>
        </Stack>
      )}
      {inicio.estado === 'rascunho' && (
        <EmAndamento rascunho={inicio.rascunho} onContinuar={() => navigate('/checklist/itens')} onDescartado={() => void carregar()} />
      )}
      {inicio.estado === 'novo' && <Formulario veiculos={inicio.veiculos} motoristas={inicio.motoristas} onComecou={() => navigate('/checklist/itens')} />}
      <Snackbar open={aviso != null} autoHideDuration={5000} onClose={() => setAviso(null)} message={aviso} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} />
    </Box>
  );
}

function EmAndamento({ rascunho, onContinuar, onDescartado }: { rascunho: ChecklistRascunho; onContinuar: () => void; onDescartado: () => void }) {
  const [confirmar, setConfirmar] = useState(false);
  const p = progresso(rascunho);
  return (
    <Stack spacing={2}>
      <Typography variant="h6">Checklist em andamento</Typography>
      <Card variant="outlined">
        <CardContent>
          <Typography fontWeight={700}>{rascunho.veiculo.identificador} — {rascunho.tipo === 'saida' ? 'Saída' : 'Chegada'}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{p.respondidos} de {p.total} itens respondidos</Typography>
          <LinearProgress variant="determinate" value={p.total === 0 ? 0 : (100 * p.respondidos) / p.total} />
        </CardContent>
      </Card>
      <Button variant="contained" size="large" sx={botaoGrande} onClick={onContinuar}>Continuar checklist</Button>
      <Button variant="outlined" color="error" size="large" sx={botaoGrande} onClick={() => setConfirmar(true)}>Descartar</Button>
      <Dialog open={confirmar} onClose={() => setConfirmar(false)}>
        <DialogTitle>Descartar checklist?</DialogTitle>
        <DialogContent>O checklist de {rascunho.veiculo.identificador} e as fotos dele serão apagados deste aparelho.</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmar(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => { setConfirmar(false); void descartarRascunho().then(onDescartado); }}>Descartar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function Formulario({ veiculos, motoristas, onComecou }: { veiculos: ItemFrotaV2[]; motoristas: ChecklistMotorista[]; onComecou: () => void }) {
  // Veículo (PLACA) ou Máquina (EXTRA), como no app; trocar recomeça a busca.
  const [catalogo, setCatalogo] = useState<CatalogoId>('veiculos');
  const [veiculo, setVeiculo] = useState<ItemFrotaV2 | null>(null);
  const [medidor, setMedidor] = useState('');
  const [corrigido, setCorrigido] = useState(false);
  const [motorista, setMotorista] = useState<ChecklistMotorista | null>(null);
  const [tipo, setTipo] = useState<ChecklistTipo>('saida');
  const [guincho, setGuincho] = useState(false);
  const [comecando, setComecando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const maquina = catalogo === 'maquinas';
  const daCategoria = useMemo(() => veiculos.filter((v) => catalogoParaCategoria(v.categoria) === catalogo), [veiculos, catalogo]);

  const comecar = async () => {
    if (!veiculo) return setErro(maquina ? 'Selecione a máquina.' : 'Selecione o veículo.');
    if (!motorista) return setErro('Informe o motorista/operador.');
    const dados = checklistVeiculoDe(veiculo);
    const valor = medidor === '' ? null : Number(medidor);
    const erroMedidor = validarMedidor(valor, { ultimo: dados.medidorUltimo, horimetro: maquina, corrigido });
    if (erroMedidor) return setErro(erroMedidor);
    setComecando(true);
    setErro(null);
    let rascunho: ChecklistRascunho = {
      ...novoRascunho({ tipo, veiculo: dados }),
      guincho,
      medidor: valor,
      motorista,
      medidorCorrigido: medidorAbaixoDoUltimo(valor, dados.medidorUltimo),
    };
    try {
      rascunho = aplicarNaoSeAplicaLembrados(rascunho, await naoSeAplicaDoUltimoChecklist(veiculo.id));
    } catch (error) {
      // Sem conexão ou sem histórico: começa com todos os itens ativos.
      console.warn('Checklist: sem "Não se aplica" do último checklist', error);
    }
    try {
      await salvarRascunho(rascunho);
      onComecou();
    } catch (error) {
      console.error('Checklist: falha ao salvar o rascunho', error);
      setComecando(false);
      setErro('Não foi possível guardar o checklist neste aparelho. Tente de novo.');
    }
  };

  return (
    <Stack spacing={2.5}>
      <ToggleButtonGroup
        exclusive
        fullWidth
        color="primary"
        value={catalogo}
        disabled={comecando}
        onChange={(_, novo: CatalogoId | null) => {
          if (!novo || novo === catalogo) return;
          setCatalogo(novo);
          setVeiculo(null);
          setMedidor('');
          setCorrigido(false);
          setErro(null);
        }}
      >
        <ToggleButton value="veiculos" sx={botaoGrande}><DirectionsCarRoundedIcon sx={{ mr: 1 }} />Veículo</ToggleButton>
        <ToggleButton value="maquinas" sx={botaoGrande}><ConstructionRoundedIcon sx={{ mr: 1 }} />Máquina</ToggleButton>
      </ToggleButtonGroup>
      <Autocomplete
        key={catalogo}
        options={daCategoria}
        value={veiculo}
        disabled={comecando}
        onChange={(_, v) => {
          setVeiculo(v);
          // Começa com o último KM/horímetro do cadastro; o mecânico ajusta.
          setMedidor(v?.quilometragemUltima != null ? String(v.quilometragemUltima) : '');
          setCorrigido(false);
          setErro(null);
        }}
        getOptionLabel={itemFrotaLabel}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={maquina ? 'Nenhuma máquina encontrada' : 'Nenhum veículo encontrado'}
        renderInput={(params) => <TextField {...params} label={maquina ? 'Máquina' : 'Veículo'} />}
      />
      {veiculo && (
        <MedidorCampo
          horimetro={maquina}
          ultimo={veiculo.quilometragemUltima}
          texto={medidor}
          onTexto={(t) => { setMedidor(t); setCorrigido(false); setErro(null); }}
          corrigido={corrigido}
          onCorrigido={(c) => { setCorrigido(c); setErro(null); }}
          disabled={comecando}
        />
      )}
      <MotoristaCampo motoristas={motoristas} valor={motorista} onChange={(m) => { setMotorista(m); setErro(null); }} disabled={comecando} />
      <ToggleButtonGroup exclusive fullWidth color="primary" value={tipo} disabled={comecando} onChange={(_, novo: ChecklistTipo | null) => { if (novo) setTipo(novo); }}>
        <ToggleButton value="saida" sx={botaoGrande}>Saída</ToggleButton>
        <ToggleButton value="chegada" sx={botaoGrande}>Chegada</ToggleButton>
      </ToggleButtonGroup>
      <FormControlLabel
        control={<Switch checked={guincho} disabled={comecando} onChange={(e) => setGuincho(e.target.checked)} />}
        label="Com guincho"
        sx={{ justifyContent: 'space-between', ml: 0 }}
        labelPlacement="start"
      />
      {erro && <Alert severity="error">{erro}</Alert>}
      <Button variant="contained" size="large" sx={botaoGrande} disabled={comecando} onClick={() => void comecar()}>
        {comecando ? <CircularProgress size={22} color="inherit" /> : 'Começar checklist'}
      </Button>
    </Stack>
  );
}
