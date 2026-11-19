import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Snackbar, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { temCredencial } from '../../services/credenciais';
import type { ResumoMecanico } from './domain/resumoMecanico';
import { carregarResumosDoMecanico } from './data/historicoMecanico';
import type { AtividadePendente } from './domain/atividade';
import { listarHistoricoDoMotorista, type AtividadeHistorico } from './data/atividadesFirestore';
import { enviador, useFilaEnvio } from './data/filaEnvio';
import PaginaMotorista from './components/PaginaMotorista';

const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const nomeTipo = (tipo: string) => (tipo === 'chegada' ? 'Chegada' : 'Saída');
const km = (valor: number | null) => (valor == null ? '—' : `KM ${valor.toLocaleString('pt-BR')}`);

type Filtro = 'tudo' | 'atividades' | 'checklist' | 'revisao';

const paraHistorico = (p: AtividadePendente): AtividadeHistorico => ({
  id: p.id,
  tipo: p.tipo,
  data: p.lancadoEm,
  identificador: p.itemFrotaSnapshot.identificador,
  km: p.km,
  obra: p.obraSnapshot.nomeObra,
  local: p.destino,
  motivo: p.motivo,
  motorista: p.motorista,
});

/**
 * /motorista/historico: para o motorista, as Saídas e Chegadas dele, só leitura, com os lançamentos deste aparelho que
 * ainda não chegaram ao servidor no topo ("Tentar novamente"). Para o mecânico (2026-11-19), também os checklists e as
 * revisões de todos os mecânicos, resumidos (os detalhes ficam na WEB); as Saídas e Chegadas continuam só as próprias.
 */
export default function HistoricoMotoristaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, authorizationProfile } = useAuth();
  const fila = useFilaEnvio();
  const uid = currentUser?.uid;
  const motorista = temCredencial(authorizationProfile, 'motorista');
  const mecanico = temCredencial(authorizationProfile, 'mecanico');
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  const [lista, setLista] = useState<AtividadeHistorico[] | null>(motorista ? null : []);
  const [erro, setErro] = useState(false);
  const [resumos, setResumos] = useState<ResumoMecanico[] | null>(mecanico ? null : []);
  const [erroResumos, setErroResumos] = useState(false);
  const [semConexao, setSemConexao] = useState(false);
  // Aviso deixado pela Saída/Chegada ao salvar.
  const [aviso, setAviso] = useState<string | null>(() => (location.state as { aviso?: string } | null)?.aviso ?? null);

  const carregar = useCallback(async () => {
    if (!uid || !motorista) return;
    setErro(false);
    try {
      setLista(await listarHistoricoDoMotorista(uid));
    } catch (error) {
      console.error('Histórico: falha ao carregar', error);
      setErro(true);
    }
  }, [uid, motorista]);

  const carregarResumos = useCallback(async () => {
    if (!uid || !mecanico) return;
    setErroResumos(false);
    try {
      setResumos(await carregarResumosDoMecanico());
    } catch (error) {
      console.error('Histórico: falha ao carregar checklists e revisões', error);
      setErroResumos(true);
    }
  }, [uid, mecanico]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarResumos(); }, [carregarResumos]);
  // O aviso vem uma vez: recarregar a página não o mostra de novo.
  useEffect(() => {
    if ((location.state as { aviso?: string } | null)?.aviso) navigate('/motorista/historico', { replace: true, state: null });
  }, [location.state, navigate]);
  // Um lançamento enviado sai do topo e aparece na lista.
  const anterior = useRef(fila.pendentes.length);
  useEffect(() => {
    if (fila.pendentes.length < anterior.current) void carregar();
    anterior.current = fila.pendentes.length;
  }, [fila.pendentes.length, carregar]);

  const tentarNovamente = () => {
    setSemConexao(!navigator.onLine);
    void enviador.enviarPendentes({ forcar: true });
  };

  const doServidor = new Set(lista?.map((a) => a.id));
  const pendentes = fila.pendentes.filter((p) => !doServidor.has(p.id));
  // Enviados agora por este aparelho que a lista ainda não trouxe (ela pode ter vindo do cache, sem conexão).
  const enviadosAgora = fila.enviados.filter((p) => p.criadoPor.uid === uid && !doServidor.has(p.id)).map(paraHistorico);
  const verAtividades = motorista && (filtro === 'tudo' || filtro === 'atividades');
  const verResumos = mecanico && filtro !== 'atividades';
  const atividades = !verAtividades ? [] : lista == null ? null : [...enviadosAgora, ...lista];
  const doMecanico = !verResumos ? [] : resumos == null ? null : resumos.filter((r) => filtro === 'tudo' || r.tipo === filtro);
  const exibidos = atividades == null || doMecanico == null ? null
    : [
      ...atividades.map((a) => ({ chave: `atividade:${a.id}`, data: a.data, atividade: a, resumo: null })),
      ...doMecanico.map((r) => ({ chave: r.chave, data: r.data, atividade: null, resumo: r })),
    ].sort((a, b) => (b.data?.getTime() ?? 0) - (a.data?.getTime() ?? 0));
  const filtros: { id: Filtro; titulo: string }[] = [
    { id: 'tudo', titulo: 'Tudo' },
    ...(motorista ? [{ id: 'atividades' as const, titulo: 'Saída/Chegada' }] : []),
    { id: 'checklist', titulo: 'Checklist' },
    { id: 'revisao', titulo: 'Revisão' },
  ];
  return (
    <PaginaMotorista>
      {motorista && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button fullWidth variant="contained" href="/motorista/saida">Nova Saída</Button>
          <Button fullWidth variant="contained" href="/motorista/chegada">Nova Chegada</Button>
        </Stack>
      )}
      <Stack spacing={1.5}>
        {mecanico && (
          <>
            <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={filtro} onChange={(_, f: Filtro | null) => { if (f) setFiltro(f); }}>
              {filtros.map((f) => <ToggleButton key={f.id} value={f.id} sx={{ textTransform: 'none', px: 0.5 }}>{f.titulo}</ToggleButton>)}
            </ToggleButtonGroup>
            {filtro !== 'atividades' && (
              <Typography variant="body2" color="text.secondary">
                Checklists e revisões de todos os mecânicos, resumidos. Itens, fotos e assinatura completos: na WEB, no computador.
              </Typography>
            )}
          </>
        )}
        {verAtividades && pendentes.length > 0 && (
          <Alert
            severity="warning"
            action={fila.enviando
              ? <CircularProgress size={20} sx={{ mt: 0.5, mr: 1 }} />
              : <Button color="inherit" size="small" onClick={tentarNovamente}>Tentar novamente</Button>}
          >
            <Typography fontWeight={700}>
              {pendentes.length === 1 ? '1 lançamento aguardando envio' : `${pendentes.length} lançamentos aguardando envio`}
            </Typography>
            <Typography variant="body2">
              {semConexao ? 'Este aparelho está sem internet. ' : ''}
              Ficam guardados neste aparelho e são enviados sozinhos quando houver conexão, com o app aberto.
            </Typography>
          </Alert>
        )}
        {verAtividades && pendentes.map((p) => <CardPendente key={p.id} pendente={p} />)}
        {erroResumos && verResumos && (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void carregarResumos()}>Tentar de novo</Button>}>
            Não foi possível carregar os checklists e as revisões.
          </Alert>
        )}
        {erro && verAtividades && (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void carregar()}>Tentar de novo</Button>}>
            Não foi possível carregar o histórico.
          </Alert>
        )}
        {!erro && !erroResumos && exibidos == null && <Stack alignItems="center" sx={{ py: 4 }}><CircularProgress /></Stack>}
        {exibidos?.length === 0 && (!verAtividades || pendentes.length === 0) && (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            {filtro === 'checklist' ? 'Nenhum checklist registrado.' : filtro === 'revisao' ? 'Nenhuma revisão registrada.' : motorista && !mecanico ? 'Nenhuma saída ou chegada registrada.' : 'Nada registrado.'}
          </Typography>
        )}
        {exibidos?.map(({ chave, atividade: a, resumo }) => (resumo ? <CardResumo key={chave} resumo={resumo} /> : a && (
          <Card key={chave} variant="outlined">
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={700}>{a.identificador || '—'} · {nomeTipo(a.tipo)}</Typography>
                  <Typography variant="body2" color="text.secondary">{a.data ? dataHora.format(a.data) : '—'} · {km(a.km)}</Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>{[a.obra, a.local].filter(Boolean).join(' · ')}</Typography>
                  {a.motorista && a.motorista.uid !== uid && (
                    <Typography variant="body2" color="text.secondary">Motorista: {a.motorista.nome}</Typography>
                  )}
                </Box>
                <Chip size="small" color="success" variant="outlined" icon={<CloudDoneOutlinedIcon />} label="Enviado" />
              </Stack>
            </CardContent>
          </Card>
        )))}
      </Stack>
      <Snackbar open={aviso != null} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} />
    </PaginaMotorista>
  );
}

function CardPendente({ pendente: p }: { pendente: AtividadePendente }) {
  const { currentUser } = useAuth();
  const paraOutro = p.motorista.uid !== currentUser?.uid;
  return (
    <Card variant="outlined" sx={{ borderColor: 'warning.main' }}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={700}>{p.itemFrotaSnapshot.identificador} · {nomeTipo(p.tipo)}</Typography>
            <Typography variant="body2" color="text.secondary">{dataHora.format(p.lancadoEm)} · {km(p.km)}</Typography>
            <Typography variant="body2" color="text.secondary" noWrap>{[p.obraSnapshot.nomeObra, p.destino].filter(Boolean).join(' · ')}</Typography>
            {paraOutro && <Typography variant="body2" color="text.secondary">Motorista: {p.motorista.nome}</Typography>}
            {p.ultimoErro && (
              <Typography variant="body2" color="warning.dark">
                {p.ultimoErro}{p.proximaTentativa ? ` Nova tentativa às ${hora.format(p.proximaTentativa)}.` : ''}
              </Typography>
            )}
          </Box>
          <Chip size="small" color="warning" icon={<CloudOffOutlinedIcon />} label="Aguardando envio" />
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Checklist ou revisão resumido, só leitura (os detalhes ficam na WEB). */
function CardResumo({ resumo: r }: { resumo: ResumoMecanico }) {
  return (
    <Card variant="outlined" sx={r.envio ? { borderColor: 'warning.main' } : undefined}>
      <CardContent>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography fontWeight={700}>{r.veiculo} · {r.tipo === 'checklist' ? 'Checklist' : 'Revisão'}</Typography>
            <Typography variant="body2" color="text.secondary">{r.data ? dataHora.format(r.data) : '—'}</Typography>
            <Typography variant="body2" color="text.secondary">{r.linhas.map((l) => `${l.rotulo}: ${l.valor}`).join(' · ')}</Typography>
            {r.envio && <Typography variant="body2" color="warning.dark">Envio: {r.envio}</Typography>}
          </Box>
          <Chip size="small" variant="outlined" color={r.tipo === 'checklist' ? 'primary' : 'secondary'} label={r.tipo === 'checklist' ? 'Checklist' : 'Revisão'} />
        </Stack>
      </CardContent>
    </Card>
  );
}
