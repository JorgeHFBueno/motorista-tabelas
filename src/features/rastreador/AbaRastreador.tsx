// Aba Rastreador de /mecanica/registros: uma linha por viagem (saiu da Fábrica e voltou), com a programação do
// Cronograma Logístico, a chegada na obra, o KM calibrado e onde a Saída/Chegada está em `atividades` (fase A.1: só a
// pronta é gravada; o resto aparece na aba Geral a completar). Quem edita a Mecânica atribui o motorista.
import { useEffect, useMemo, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { useAuth } from '../../contexts/AuthContext';
import { editaArea } from '../../services/credenciais';
import type { AtividadeComData, FiltrosAtividade } from '../../services/atividade-filtros';
import { listarMotoristas } from '../saida-chegada/data/atividadesFirestore';
import { atribuirMotorista } from './data/rastreadorFirestore';
import { filtrarViagens, registroProximo, veiculosSemSinal, type Falta, type RegistroViagem, type VeiculoRastreador, type ViagemRastreador } from './domain/viagem';
import type { DadosRastreador } from './useRastreador';

type Pessoa = { uid: string; nome: string };

const dataHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const km = new Intl.NumberFormat('pt-BR');
const fmtKm = (v: number | null | undefined) => (typeof v === 'number' ? km.format(v) : '—');
const duracao = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
/** KM do painel (calibrado) quando houver; senão, o hodômetro do rastreador, que não é o do painel. */
const kmTexto = (painel: number | null | undefined, rastreador: number | null) =>
  (typeof painel === 'number' ? `KM ${fmtKm(painel)}` : `hodômetro ${fmtKm(rastreador)} (sem calibração)`);

function Linhas({ principal, detalhe }: { principal: string; detalhe?: string | null }) {
  return (
    <Box sx={{ py: 0.5 }}>
      <Typography variant="body2">{principal}</Typography>
      {detalhe && <Typography variant="caption" color="text.secondary">{detalhe}</Typography>}
    </Box>
  );
}

function registroTexto(a: AtividadeComData | null, kmRastreador: number | null) {
  if (!a?.dataJS) return null;
  const dif = typeof a.km === 'number' && kmRastreador != null ? a.km - kmRastreador : null;
  return `${dataHora.format(a.dataJS)} · KM ${fmtKm(a.km)}${dif != null ? ` (dif. ${dif > 0 ? '+' : ''}${km.format(dif)})` : ''}`;
}

const NOMES_FALTA: Record<Falta, string> = { motorista: 'motorista', obra: 'obra', destino: 'local', motivo: 'motivo', km: 'KM', saida: 'a Saída' };

/** Onde a Saída/Chegada está em atividades, como a Function decidiu (o KM do App comparado ao calibrado). */
function estadoTexto(tipo: string, r: RegistroViagem, atividades: AtividadeComData[]) {
  if (r.estado === 'app') {
    const a = atividades.find((x) => x.id === r.atividadeId) ?? null;
    return `${tipo} pelo App${a ? ` ${registroTexto(a, r.km)}` : ''}`;
  }
  if (r.estado === 'rastreador') return `${tipo} gravada pelo rastreador`;
  if (r.estado === 'aguardando') return `${tipo} aguardando o App (30 min)`;
  return `${tipo} a completar: ${r.faltam.map((f) => NOMES_FALTA[f]).join(', ')}`;
}

function textoCalibracao(v: VeiculoRastreador) {
  const c = v.calibracao;
  if (!c) return 'ainda não calibrado';
  if (c.ajusteKm == null) return `sem ajuste: ${c.motivo ?? 'leituras insuficientes'}`;
  const concordam = c.amostras.filter((a) => a.concorda).length;
  return `KM do painel = rastreador ${c.ajusteKm >= 0 ? '+' : '−'} ${km.format(Math.abs(c.ajusteKm))} km (${concordam} de ${c.amostras.length} leituras concordam)`;
}

export default function AbaRastreador({ filtros, atividades, dados }: { filtros: FiltrosAtividade; atividades: AtividadeComData[]; dados: DadosRastreador }) {
  const { currentUser, authorizationProfile } = useAuth();
  const podeEditar = editaArea(authorizationProfile, 'mecanica');
  const { viagens, veiculos } = dados;
  const [erro, setErro] = useState<string | null>(null);
  const [motoristas, setMotoristas] = useState<Pessoa[]>([]);
  const [atribuindo, setAtribuindo] = useState<ViagemRastreador | null>(null);
  const [escolhido, setEscolhido] = useState<Pessoa | null>(null);
  const [gravando, setGravando] = useState(false);

  useEffect(() => {
    if (!podeEditar) return;
    listarMotoristas().then(setMotoristas).catch(() => setMotoristas([]));
  }, [podeEditar]);

  const linhas = useMemo(() => filtrarViagens(viagens ?? [], filtros), [viagens, filtros]);
  const semSinal = useMemo(() => veiculosSemSinal(veiculos, new Date()), [veiculos]);

  const salvar = async () => {
    if (!atribuindo || !escolhido || !currentUser) return;
    setGravando(true);
    try {
      await atribuirMotorista(atribuindo.id, escolhido, { uid: currentUser.uid, nome: authorizationProfile?.nome || currentUser.displayName || currentUser.email || currentUser.uid });
      setAtribuindo(null);
    } catch (e) {
      setErro(`Não foi possível atribuir o motorista: ${(e as Error).message}`);
    } finally {
      setGravando(false);
    }
  };

  const colunas: GridColDef<ViagemRastreador>[] = useMemo(() => [
    {
      field: 'saida', headerName: 'Saiu da Fábrica', width: 150,
      valueGetter: (_v, row) => row.saida.data.getTime(),
      renderCell: ({ row }) => <Linhas principal={dataHora.format(row.saida.data)} detalhe={kmTexto(row.registros.saida?.km, row.saida.km)} />,
    },
    {
      field: 'veiculo', headerName: 'Veículo', minWidth: 150, flex: 0.9,
      valueGetter: (_v, row) => row.placa,
      renderCell: ({ row }) => <Linhas principal={row.placa || '—'} detalhe={row.veiculoNome} />,
    },
    {
      field: 'chegada', headerName: 'Voltou à Fábrica', width: 150,
      valueGetter: (_v, row) => row.chegada?.data.getTime() ?? Number.MAX_SAFE_INTEGER,
      renderCell: ({ row }) => (row.chegada
        ? <Linhas principal={dataHora.format(row.chegada.data)} detalhe={kmTexto(row.registros.chegada?.km, row.chegada.km)} />
        : <Chip size="small" color="warning" variant="outlined" label="Em andamento" />),
    },
    {
      field: 'kmRodado', headerName: 'KM rodado', width: 105, align: 'right', headerAlign: 'right',
      renderCell: ({ row }) => <Linhas principal={fmtKm(row.kmRodado)} detalhe={row.maisLongeKm != null ? `até ${km.format(Math.round(row.maisLongeKm))} km` : null} />,
    },
    {
      field: 'obra', headerName: 'Programação e obra', minWidth: 240, flex: 1.6,
      valueGetter: (_v, row) => row.obras.join(', '),
      renderCell: ({ row }) => {
        if (!row.programacoes.length) {
          const p = row.paradaMaisLonga;
          return <Linhas principal="Sem programação" detalhe={p ? `Parou ${duracao(p.minutos)} em ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : null} />;
        }
        const v = row.visitaObra;
        return (
          <Linhas
            principal={row.programacoes.map((p) => [p.item, p.obra].filter(Boolean).join(' · ')).join(' | ')}
            detalhe={v ? `Na obra de ${dataHora.format(v.chegou)} a ${dataHora.format(v.saiu)} (${v.nome})` : 'Não confirmou a chegada na obra'}
          />
        );
      },
    },
    {
      field: 'motorista', headerName: 'Motorista', minWidth: 190, flex: 1.1,
      valueGetter: (_v, row) => row.motorista?.nome ?? '',
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.5 }}>
          <Linhas
            principal={row.motorista?.nome ?? (row.programacoes.length > 1 ? 'Mais de uma programação' : 'Sem motorista')}
            detalhe={row.motoristaOrigem === 'programacao' ? 'pelo Cronograma' : row.motoristaOrigem === 'manual' ? `atribuído${row.atribuidoPor ? ` por ${row.atribuidoPor}` : ''}` : null}
          />
          {podeEditar && (
            <Button size="small" onClick={() => { setAtribuindo(row); setEscolhido(row.motorista?.uid ? { uid: row.motorista.uid, nome: row.motorista.nome } : null); }}>
              {row.motorista ? 'Trocar' : 'Atribuir'}
            </Button>
          )}
        </Stack>
      ),
    },
    {
      field: 'registro', headerName: 'Em atividades', minWidth: 240, flex: 1.3, sortable: false,
      renderCell: ({ row }) => {
        const { saida, chegada } = row.registros;
        if (saida) {
          return (
            <Linhas
              principal={estadoTexto('Saída', saida, atividades)}
              detalhe={chegada ? estadoTexto('Chegada', chegada, atividades) : row.chegada ? null : 'Chegada quando voltar'}
            />
          );
        }
        // Viagens de antes da fase A.1 (ou fora dos últimos 15 dias): o registro do motorista mais perto, a até 4 h.
        const s = registroTexto(registroProximo(atividades, row.veiculoId, 'saida', row.saida.data), row.saida.km);
        const c = registroTexto(registroProximo(atividades, row.veiculoId, 'chegada', row.chegada?.data ?? null), row.chegada?.km ?? null);
        if (!s && !c) return <Typography variant="body2" color="text.secondary">Sem registro</Typography>;
        return <Linhas principal={s ? `Saída ${s}` : 'Saída sem registro'} detalhe={row.chegada ? (c ? `Chegada ${c}` : 'Chegada sem registro') : null} />;
      },
    },
  ], [atividades, podeEditar]);

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Uma linha por viagem lida do rastreador (Fulltrack) a cada 30 minutos, desde 09/11/2026: saiu do raio de 1 km da Fábrica e voltou a ele; chegada
        a 600 m da obra programada (Local da programação ou LOTE da obra). Fase A.1: 30 min depois da saída e da volta, sem registro do App, a Saída e a
        Chegada prontas (motorista, obra confirmada e KM calibrado) vão para a aba Geral; as outras aparecem lá a completar. Os filtros de Local e Tipo
        não se aplicam aqui.
      </Alert>
      {veiculos.some((v) => v.temRastreador) && (
        <Accordion disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2">
              Calibração do KM: {veiculos.filter((v) => v.calibracao?.ajusteKm != null).length} de {veiculos.filter((v) => v.temRastreador).length} veículos com ajuste
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="caption" color="text.secondary" component="p" mb={1}>
              Cada leitura do painel dos últimos 15 dias (Saída/Chegada do App e abastecimentos), com o veículo na Fábrica ou a até 60 min da saída/volta,
              é comparada ao hodômetro do rastreador na mesma hora. O ajuste é a mediana das 7 mais recentes; vale com pelo menos 3 a até 15 km dela.
              Recalculado uma vez por dia.
            </Typography>
            <Stack spacing={1}>
              {veiculos.filter((v) => v.temRastreador).sort((a, b) => a.identificador.localeCompare(b.identificador, 'pt-BR')).map((v) => (
                <Box key={v.id}>
                  <Typography variant="body2"><strong>{v.identificador}</strong>: {textoCalibracao(v)}</Typography>
                  {v.calibracao?.amostras.map((a) => (
                    <Typography key={`${a.fonte}-${a.data.getTime()}`} variant="caption" color={a.concorda ? 'text.secondary' : 'warning.dark'} component="div" sx={{ pl: 2 }}>
                      {dataHora.format(a.data)} · {a.fonte === 'combustivel' ? 'abastecimento' : 'Saída/Chegada do App'}: painel {fmtKm(a.km)} − rastreador {fmtKm(a.kmRastreador)} = {a.diferenca >= 0 ? '' : '−'}{fmtKm(Math.abs(a.diferenca))}{a.concorda ? '' : ' (fora)'}
                    </Typography>
                  ))}
                </Box>
              ))}
            </Stack>
          </AccordionDetails>
        </Accordion>
      )}
      {semSinal.length > 0 && (
        <Alert severity="warning">
          Sem rastreador ou sem sinal há mais de 3 dias (continuam com o registro manual): {semSinal.map((v) => v.identificador).join(', ')}.
        </Alert>
      )}
      {dados.erro && <Alert severity="error">{dados.erro}</Alert>}
      {erro && <Alert severity="error" onClose={() => setErro(null)}>{erro}</Alert>}
      <Box sx={{ height: 'calc(100vh - 320px)', minHeight: 500, width: '100%' }}>
        <DataGrid
          rows={linhas}
          columns={colunas}
          loading={viagens === null}
          getRowId={(row) => row.id}
          disableRowSelectionOnClick
          density="compact"
          getRowHeight={() => 'auto'}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 100 } }, sorting: { sortModel: [{ field: 'saida', sort: 'desc' }] } }}
          localeText={{ noRowsLabel: 'Nenhuma viagem para os filtros selecionados.', noResultsOverlayLabel: 'Nenhuma viagem para os filtros selecionados.' }}
          sx={{ '& .MuiDataGrid-cell': { display: 'flex', alignItems: 'center', py: 0.75, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.35 } }}
        />
      </Box>

      <Dialog open={atribuindo !== null} onClose={() => !gravando && setAtribuindo(null)} fullWidth maxWidth="xs">
        <DialogTitle>Motorista da viagem</DialogTitle>
        <DialogContent>
          {atribuindo && (
            <Typography variant="body2" color="text.secondary" mb={2}>
              {atribuindo.placa} · saída {dataHora.format(atribuindo.saida.data)}
            </Typography>
          )}
          <Autocomplete
            options={motoristas}
            value={escolhido}
            onChange={(_e, v) => setEscolhido(v)}
            getOptionLabel={(m) => m.nome}
            isOptionEqualToValue={(a, b) => a.uid === b.uid}
            noOptionsText="Nenhum motorista"
            renderInput={(params) => <TextField {...params} label="Motorista" autoFocus />}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAtribuindo(null)} disabled={gravando}>Cancelar</Button>
          <Button variant="contained" onClick={salvar} disabled={!escolhido || gravando}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
