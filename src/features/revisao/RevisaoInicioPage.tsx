import {
  Alert, Autocomplete, Button, Card, CardActionArea, CardContent, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, Snackbar, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded';
import DirectionsCarRoundedIcon from '@mui/icons-material/DirectionsCarRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { itemFrotaLabel, type ItemFrotaV2 } from '../../utils/cadastrosV2';
import { catalogoParaCategoria, type CatalogoId } from '../checklist-mecanico/domain/catalogo';
import { checklistVeiculoDe, listarVeiculosChecklist } from '../checklist-mecanico/data/checklistFirestore';
import AvisoInstalar from '../saida-chegada/components/AvisoInstalar';
import PaginaMotorista from '../saida-chegada/components/PaginaMotorista';
import { carregarRascunho, descartarRascunho, listarRegistros, salvarRascunho } from './data/armazenamentoLocal';
import { enviador, useFilaRevisao } from './data/filaEnvio';
import { listarAbertas } from './data/revisaoFirestore';
import { tituloDe, TIPOS } from './domain/listas';
import { estaAberta, novoRegistro, type RevisaoRegistro } from './domain/registro';
import { abertosDoVeiculo, descricaoRegistro, juntarComServidor } from './domain/regras';

type Inicio =
  | { estado: 'carregando' }
  | { estado: 'erro' }
  | { estado: 'pronto'; rascunho: RevisaoRegistro | null; registros: RevisaoRegistro[]; veiculos: ItemFrotaV2[] | null };

const botaoGrande = { minHeight: 52, fontSize: 16, fontWeight: 700, textTransform: 'none' } as const;

/**
 * /motorista/revisao: a Manutenção do app (credencial mecanico) no WEB. A revisão nova ainda não salva, os registros em
 * manutenção (deste aparelho e do servidor) e "Nova revisão".
 */
export default function RevisaoInicioPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fila = useFilaRevisao();
  const [inicio, setInicio] = useState<Inicio>({ estado: 'carregando' });
  // Aviso deixado pela tela do registro ao fechar.
  const [aviso, setAviso] = useState<string | null>(() => (location.state as { aviso?: string } | null)?.aviso ?? null);

  const carregar = useCallback(async () => {
    setInicio({ estado: 'carregando' });
    try {
      // Sem conexão, ficam só os deste aparelho; sem a lista de veículos, os registros continuam acessíveis.
      const [rascunho, locais, servidor, veiculos] = await Promise.all([
        carregarRascunho(),
        listarRegistros(),
        listarAbertas().catch((error) => { console.warn('Revisão: sem os abertos do servidor', error); return []; }),
        listarVeiculosChecklist().catch((error) => { console.warn('Revisão: sem a lista de veículos', error); return null; }),
      ]);
      setInicio({ estado: 'pronto', rascunho, registros: juntarComServidor(locais, servidor.map((l) => l.registro)), veiculos });
    } catch (error) {
      console.error('Revisão: falha ao carregar', error);
      setInicio({ estado: 'erro' });
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    if ((location.state as { aviso?: string } | null)?.aviso) navigate('/motorista/revisao', { replace: true, state: null });
  }, [location.state, navigate]);

  const abrir = (registro: RevisaoRegistro) => navigate(`/motorista/revisao/${encodeURIComponent(registro.id)}`, { state: { registro } });

  return (
    <PaginaMotorista>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={800}>Revisão</Typography>
        <Button variant="outlined" startIcon={<HistoryRoundedIcon />} onClick={() => navigate('/motorista/revisao/historico')}>Histórico</Button>
      </Stack>
      <AvisoInstalar />
      {(fila.pendentes > 0 || fila.naoEnviadas > 0) && (
        <Alert
          severity={fila.naoEnviadas > 0 ? 'error' : fila.enviando ? 'info' : 'warning'}
          sx={{ mb: 2 }}
          action={fila.enviando
            ? <CircularProgress size={20} sx={{ mt: 0.5, mr: 1 }} />
            : <Button color="inherit" size="small" onClick={() => void enviador.enviarPendentes({ forcar: true })}>Enviar agora</Button>}
        >
          {fila.pendentes > 0 && (
            <Typography fontWeight={700}>{fila.pendentes === 1 ? '1 revisão aguardando envio' : `${fila.pendentes} revisões aguardando envio`}</Typography>
          )}
          {fila.naoEnviadas > 0 && (
            <Typography fontWeight={700}>{fila.naoEnviadas === 1 ? '1 revisão não enviada' : `${fila.naoEnviadas} revisões não enviadas`}: veja o motivo no histórico.</Typography>
          )}
          <Typography variant="body2">Mantenha o app aberto até terminar.</Typography>
        </Alert>
      )}
      {inicio.estado === 'carregando' && <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack>}
      {inicio.estado === 'erro' && (
        <Stack spacing={2} alignItems="center" sx={{ py: 6 }}>
          <Typography>Não foi possível abrir as revisões.</Typography>
          <Button variant="outlined" onClick={() => void carregar()}>Tentar de novo</Button>
        </Stack>
      )}
      {inicio.estado === 'pronto' && <Conteudo inicio={inicio} onAbrir={abrir} onRecarregar={() => void carregar()} />}
      <Snackbar open={aviso != null} autoHideDuration={5000} onClose={() => setAviso(null)} message={aviso} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} />
    </PaginaMotorista>
  );
}

function CartaoRegistro({ registro, titulo, onClick }: { registro: RevisaoRegistro; titulo: string; onClick: () => void }) {
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onClick}>
        <CardContent>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <BuildOutlinedIcon color="action" />
            <Stack sx={{ minWidth: 0 }}>
              <Typography fontWeight={700}>{titulo}</Typography>
              <Typography variant="body2" color="text.secondary">{descricaoRegistro(registro)}</Typography>
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function Conteudo({ inicio, onAbrir, onRecarregar }: {
  inicio: Extract<Inicio, { estado: 'pronto' }>;
  onAbrir: (r: RevisaoRegistro) => void;
  onRecarregar: () => void;
}) {
  const [descartar, setDescartar] = useState(false);
  const { rascunho } = inicio;
  const abertos = inicio.registros.filter(estaAberta);
  return (
    <Stack spacing={2}>
      {rascunho && (
        <>
          <Typography variant="h6">Revisão não salva</Typography>
          <Card variant="outlined">
            <CardContent>
              <Typography fontWeight={700}>{rascunho.veiculo.identificador}</Typography>
              <Typography variant="body2" color="text.secondary">{descricaoRegistro(rascunho)}</Typography>
            </CardContent>
            <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ px: 2, pb: 2 }}>
              <Button color="error" onClick={() => setDescartar(true)}>Descartar</Button>
              <Button variant="contained" onClick={() => onAbrir(rascunho)}>Continuar</Button>
            </Stack>
          </Card>
          <Dialog open={descartar} onClose={() => setDescartar(false)}>
            <DialogTitle>Descartar revisão?</DialogTitle>
            <DialogContent>A revisão de {rascunho.veiculo.identificador} ainda não foi salva. Ela e as fotos dela serão apagadas deste aparelho.</DialogContent>
            <DialogActions>
              <Button onClick={() => setDescartar(false)}>Cancelar</Button>
              <Button color="error" variant="contained" onClick={() => { setDescartar(false); void descartarRascunho().then(onRecarregar); }}>Descartar</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      <Typography variant="h6">Em manutenção ({abertos.length})</Typography>
      {abertos.length === 0 && <Typography color="text.secondary">Nenhuma revisão aberta.</Typography>}
      {abertos.map((r) => (
        <CartaoRegistro key={r.id} registro={r} titulo={`${r.veiculo.identificador} · ${tituloDe(TIPOS, r.tipo) ?? 'sem tipo'}`} onClick={() => onAbrir(r)} />
      ))}
      <Typography variant="h6" sx={{ pt: 1 }}>Nova revisão</Typography>
      {rascunho ? (
        <Typography color="text.secondary">Salve ou descarte a revisão não salva antes de começar outra.</Typography>
      ) : inicio.veiculos == null ? (
        <Stack spacing={1} alignItems="flex-start">
          <Typography>Não foi possível carregar os veículos.</Typography>
          <Button variant="outlined" onClick={onRecarregar}>Tentar de novo</Button>
        </Stack>
      ) : (
        <NovaRevisao veiculos={inicio.veiculos} abertos={abertos} onAbrir={onAbrir} />
      )}
    </Stack>
  );
}

function NovaRevisao({ veiculos, abertos, onAbrir }: { veiculos: ItemFrotaV2[]; abertos: RevisaoRegistro[]; onAbrir: (r: RevisaoRegistro) => void }) {
  // Veículo (PLACA) ou Máquina (EXTRA), como no Checklist; trocar recomeça a busca.
  const [catalogo, setCatalogo] = useState<CatalogoId>('veiculos');
  const [veiculo, setVeiculo] = useState<ItemFrotaV2 | null>(null);
  const [comecando, setComecando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const maquina = catalogo === 'maquinas';
  const daCategoria = useMemo(() => veiculos.filter((v) => catalogoParaCategoria(v.categoria) === catalogo), [veiculos, catalogo]);
  const jaAbertos = veiculo ? abertosDoVeiculo(abertos, veiculo.id) : [];

  const comecar = async () => {
    if (!veiculo) return;
    setComecando(true);
    setErro(null);
    const registro = novoRegistro({ veiculo: checklistVeiculoDe(veiculo) });
    try {
      await salvarRascunho(registro);
      onAbrir(registro);
    } catch (error) {
      console.error('Revisão: falha ao guardar o rascunho', error);
      setComecando(false);
      setErro('Não foi possível guardar a revisão neste aparelho. Tente de novo.');
    }
  };

  return (
    <Stack spacing={2}>
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
        onChange={(_, v) => setVeiculo(v)}
        getOptionLabel={itemFrotaLabel}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        noOptionsText={maquina ? 'Nenhuma máquina encontrada' : 'Nenhum veículo encontrado'}
        renderInput={(params) => <TextField {...params} label={maquina ? 'Máquina' : 'Veículo'} />}
      />
      {veiculo && jaAbertos.length > 0 && (
        <Stack spacing={1}>
          <Typography>
            {jaAbertos.length === 1
              ? `${veiculo.identificador} já está em manutenção. Continue esta ou crie outra:`
              : `${veiculo.identificador} já tem ${jaAbertos.length} revisões abertas. Continue uma delas ou crie outra:`}
          </Typography>
          {jaAbertos.map((r) => <CartaoRegistro key={r.id} registro={r} titulo={tituloDe(TIPOS, r.tipo) ?? 'Sem tipo'} onClick={() => onAbrir(r)} />)}
        </Stack>
      )}
      {erro && <Alert severity="error">{erro}</Alert>}
      <Button variant="contained" size="large" sx={botaoGrande} disabled={!veiculo || comecando} onClick={() => void comecar()}>
        {comecando ? <CircularProgress size={22} color="inherit" /> : jaAbertos.length === 0 ? 'Começar revisão' : 'Criar outra revisão'}
      </Button>
    </Stack>
  );
}
