import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  AddRounded,
  CalendarMonthOutlined,
  HistoryRounded,
  Inventory2Outlined,
  LocalGasStationRounded,
  PaymentsOutlined,
  ReceiptLongOutlined,
  ScaleOutlined,
} from '@mui/icons-material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Timestamp } from 'firebase/firestore';
import type { Bomba } from '../types/Bomba';
import {
  listBombas,
  listFuelMovements,
  registerDieselEntry,
  type FuelMovement,
} from '../services/bombasService';
import { useAuth } from '../contexts/AuthContext';
import { useAuthorizationProfile } from '../hooks/useAuthorizationProfile';
import {
  DIESEL_PATIO_ID,
  calculateUnitPrice,
  getPumpIndicators,
  parsePtBrNumber,
  storedTenthsToLiters,
  suggestBatch,
} from '../utils/bombasDomain';

type Feedback = { message: string; severity: 'success' | 'error' };

const todayInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value && typeof (value as Timestamp).toDate === 'function') return (value as Timestamp).toDate();
  if (value && typeof (value as { seconds?: unknown }).seconds === 'number') {
    return new Date((value as { seconds: number }).seconds * 1000);
  }
  return null;
}

function bombaName(bomba: Bomba): string {
  return bomba.nomeBomba?.trim() || bomba.nome?.trim() || bomba.descricao?.trim() ||
    (bomba.id === DIESEL_PATIO_ID ? 'Bomba diesel — pátio' : bomba.id);
}

export default function BombasPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const { profile, loading: authorizationLoading } = useAuthorizationProfile(currentUser, authLoading);
  const canRegister = profile?.adm2 === true;
  const [bombas, setBombas] = useState<Bomba[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [movements, setMovements] = useState<FuelMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [totalPrice, setTotalPrice] = useState('');
  const [purchasedLiters, setPurchasedLiters] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayInput());
  const [batch, setBatch] = useState(suggestBatch(todayInput()));

  const selectedBomba = bombas.find((bomba) => bomba.id === selectedId) ?? null;

  const loadMovements = useCallback(async (bombaId: string) => {
    setHistoryLoading(true);
    try {
      const data = await listFuelMovements(bombaId);
      setMovements(data);
    } catch {
      setMovements([]);
      setFeedback({ message: 'Não foi possível carregar o histórico da bomba.', severity: 'error' });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadPage = useCallback(async (preferredId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBombas();
      const sorted = [...data].sort((a, b) => bombaName(a).localeCompare(bombaName(b), 'pt-BR'));
      setBombas(sorted);
      const nextId = preferredId && sorted.some((item) => item.id === preferredId)
        ? preferredId
        : sorted.find((item) => item.id === DIESEL_PATIO_ID)?.id ?? sorted[0]?.id ?? '';
      setSelectedId(nextId);
      if (nextId) await loadMovements(nextId);
      else setMovements([]);
    } catch {
      setError('Não foi possível carregar as bombas. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [loadMovements]);

  useEffect(() => { void loadPage(); }, [loadPage]);

  const handlePumpChange = (bombaId: string) => {
    setSelectedId(bombaId);
    setMovements([]);
    void loadMovements(bombaId);
  };

  const latestPurchase = useMemo(
    () => movements.find((movement) => movement.tipo === 'entrada') ?? null,
    [movements],
  );
  const total = latestPurchase?.preco;
  const purchased = storedTenthsToLiters(latestPurchase?.litrosComprados);
  const indicators = getPumpIndicators(selectedBomba ?? {});
  const parsedTotal = parsePtBrNumber(totalPrice);
  const parsedLiters = parsePtBrNumber(purchasedLiters);
  const calculatedUnitPrice = calculateUnitPrice(parsedTotal, parsedLiters);

  const currency = useMemo(() => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
  }), []);
  const liters = useMemo(() => new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 1,
  }), []);
  const unitPrice = (value: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) ? `${currency.format(value)}/L` : '—';
  const litersLabel = (value: number | null) => value === null ? '—' : `${liters.format(value)} L`;
  const dateLabel = (value: unknown, includeTime = false) => {
    const date = toDate(value);
    if (!date) return '—';
    return new Intl.DateTimeFormat('pt-BR', includeTime
      ? { dateStyle: 'short', timeStyle: 'short' }
      : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
  };

  const openEntry = () => {
    const initialDate = todayInput();
    setTotalPrice('');
    setPurchasedLiters('');
    setPurchaseDate(initialDate);
    setBatch(suggestBatch(initialDate));
    setFormError(null);
    setEntryOpen(true);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!canRegister) return setFormError('Entrada de diesel permitida somente para usuários adm2.');
    if (!selectedBomba || selectedBomba.id !== DIESEL_PATIO_ID) {
      return setFormError('O fluxo Flutter permite entrada somente na bomba diesel_patio.');
    }
    const totalValue = parsePtBrNumber(totalPrice);
    const litersValue = parsePtBrNumber(purchasedLiters);
    if (!(totalValue > 0) || !Number.isFinite(totalValue)) return setFormError('Informe um preço total maior que zero.');
    if (!(litersValue > 0) || !Number.isFinite(litersValue)) return setFormError('Informe litros comprados maior que zero.');
    if (!purchaseDate) return setFormError('Informe a data da compra.');
    if (!batch.trim()) return setFormError('Informe o lote da compra.');
    if (!currentUser?.uid || !currentUser.email) return setFormError('Usuário autenticado não identificado.');

    const [year, month, day] = purchaseDate.split('-').map(Number);
    const now = new Date();
    const selectedDate = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds());
    setSaving(true);
    setFormError(null);
    try {
      await registerDieselEntry({
        bombaId: selectedBomba.id,
        totalPrice: totalValue,
        purchasedLiters: litersValue,
        purchaseDate: selectedDate,
        batch,
        authUid: currentUser.uid,
        userEmail: currentUser.email,
      });
      setEntryOpen(false);
      setFeedback({ message: 'Entrada de diesel registrada e estoque atualizado.', severity: 'success' });
      await loadPage(selectedBomba.id);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Não foi possível registrar a entrada.');
    } finally {
      setSaving(false);
    }
  };

  const cards = [
    { label: 'Preço total', value: typeof total === 'number' ? currency.format(total) : '—', icon: <PaymentsOutlined /> },
    { label: 'Litros comprados', value: litersLabel(purchased), icon: <ScaleOutlined /> },
    { label: 'Data da compra', value: dateLabel(latestPurchase?.data), icon: <CalendarMonthOutlined /> },
    { label: 'Preço por litro', value: unitPrice(latestPurchase?.precoLitro), icon: <ReceiptLongOutlined /> },
    { label: 'Montante atual', value: litersLabel(indicators.montanteLiters), helper: 'Leitura física da bomba', icon: <Inventory2Outlined /> },
    { label: 'Litros atual', value: litersLabel(indicators.stockLiters), helper: 'Estoque disponível', icon: <LocalGasStationRounded /> },
    { label: 'Lote', value: latestPurchase?.lote || 'Não informado', icon: <Inventory2Outlined /> },
  ];

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2, md: 4 } }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems={{ sm: 'center' }}>
          <Box>
            <Typography variant="h4">Bombas</Typography>
            <Typography color="text.secondary">Controle e acompanhamento das bombas de combustível</Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            onClick={openEntry}
            disabled={!canRegister || selectedId !== DIESEL_PATIO_ID || loading}
          >
            Nova entrada de diesel
          </Button>
        </Stack>

        {(loading || authorizationLoading) && <LinearProgress />}
        {error && <Alert severity="error" action={<Button onClick={() => void loadPage()}>Tentar novamente</Button>}>{error}</Alert>}
        {!loading && !error && bombas.length === 0 && <Alert severity="info">Nenhuma bomba cadastrada.</Alert>}

        {selectedBomba && (
          <>
            <Box sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'minmax(0, 1fr)',
                sm: 'repeat(2, minmax(0, 1fr))',
                md: 'repeat(3, minmax(0, 1fr))',
                lg: 'minmax(230px, 1.15fr) repeat(4, minmax(0, 1fr))',
              },
              gridAutoRows: { lg: 'minmax(164px, 1fr)' },
              gap: 2,
            }}>
              <Paper sx={{
                p: { xs: 3, md: 4 },
                minHeight: { xs: 220, lg: 'auto' },
                gridColumn: { xs: 'auto', sm: '1 / -1', lg: '1' },
                gridRow: { lg: 'span 2' },
                color: 'primary.contrastText',
                background: 'linear-gradient(145deg, #12293b, #2f6b98)',
              }}>
                <Stack height="100%" minHeight="inherit" justifyContent="center" alignItems="center" spacing={3}>
                  <LocalGasStationRounded sx={{ fontSize: { xs: 64, lg: 76 }, opacity: 0.95 }} />
                  <Box sx={{ width: '100%', maxWidth: 280 }}>
                    <Select
                      value={selectedId}
                      onChange={(event) => handlePumpChange(event.target.value)}
                      variant="standard"
                      disableUnderline
                      fullWidth
                      inputProps={{ 'aria-label': 'Selecionar bomba' }}
                      renderValue={() => bombaName(selectedBomba)}
                      sx={{
                        color: 'inherit',
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        '& .MuiSelect-select': { py: 0.75, pr: '40px !important' },
                        '& .MuiSelect-icon': { color: 'inherit' },
                        '& .MuiSelect-select:focus': { bgcolor: 'transparent' },
                      }}
                    >
                      {bombas.map((bomba) => <MenuItem key={bomba.id} value={bomba.id}>{bombaName(bomba)}</MenuItem>)}
                    </Select>
                  </Box>
                </Stack>
              </Paper>

              {cards.map((card) => <MetricCard key={card.label} {...card} />)}

              <Paper
                component="button"
                type="button"
                onClick={() => setHistoryOpen(true)}
                variant="outlined"
                sx={{
                  p: 2.5,
                  minHeight: 164,
                  display: 'flex',
                  alignItems: 'center',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: 'pointer',
                  width: '100%',
                  color: 'text.primary',
                  bgcolor: 'background.paper',
                  '&:hover': { borderColor: 'secondary.main', bgcolor: 'rgba(47,107,152,.04)' },
                  '&:focus-visible': { outline: '3px solid', outlineColor: 'secondary.main', outlineOffset: 2 },
                }}
              >
                <Stack width="100%" justifyContent="center" spacing={1}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box color="secondary.main" sx={{ display: 'flex' }}><HistoryRounded /></Box>
                    {historyLoading && <CircularProgress size={22} />}
                  </Stack>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Histórico</Typography>
                    <Typography variant="body1" fontWeight={700}>Ver movimentações e abastecimentos</Typography>
                  </Box>
                </Stack>
              </Paper>
            </Box>
            {!canRegister && !authorizationLoading && <Alert severity="info">A consulta está disponível, mas novas entradas exigem perfil adm2.</Alert>}
            {selectedId !== DIESEL_PATIO_ID && <Alert severity="info">Esta bomba pode ser consultada. O Flutter só define entrada de estoque para diesel_patio.</Alert>}
          </>
        )}
      </Stack>

      <Dialog open={entryOpen} onClose={saving ? undefined : () => setEntryOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova entrada de diesel</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField label="Bomba" value={selectedBomba ? bombaName(selectedBomba) : ''} disabled fullWidth />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Preço total" value={totalPrice} onChange={(event) => setTotalPrice(event.target.value)} placeholder="R$ 20.000,00" required fullWidth inputMode="decimal" />
              <TextField label="Litros comprados" value={purchasedLiters} onChange={(event) => setPurchasedLiters(event.target.value)} placeholder="5.000" required fullWidth inputMode="decimal" />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Data da compra"
                type="date"
                value={purchaseDate}
                onChange={(event) => { setPurchaseDate(event.target.value); setBatch(suggestBatch(event.target.value)); }}
                required fullWidth slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField label="Preço por litro" value={unitPrice(calculatedUnitPrice)} disabled fullWidth />
            </Stack>
            <TextField label="Lote" value={batch} onChange={(event) => setBatch(event.target.value)} required fullWidth />
            <TextField
              label="Responsável"
              value={profile?.nome || profile?.id || ''}
              disabled
              fullWidth
              helperText="Obtido do cadastro Firestore do usuário autenticado."
            />
            <TextField
              label="Leitura atual da bomba (L)"
              value={litersLabel(indicators.montanteLiters)}
              disabled fullWidth
              helperText="A entrada de estoque não altera o totalizador físico da bomba."
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={() => setEntryOpen(false)} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving} startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <AddRounded />}>
            {saving ? 'Salvando...' : 'Registrar entrada'}
          </Button>
        </DialogActions>
      </Dialog>

      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} movements={movements} loading={historyLoading} dateLabel={dateLabel} litersLabel={litersLabel} currency={currency} />
      <Snackbar open={!!feedback} autoHideDuration={5000} onClose={() => setFeedback(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {feedback ? <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert> : undefined}
      </Snackbar>
    </Container>
  );
}

function MetricCard({ label, value, helper, icon }: { label: string; value: string; helper?: string; icon: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, minHeight: 164, display: 'flex', alignItems: 'center' }}>
      <Stack width="100%" justifyContent="center" spacing={1}>
        <Box color="secondary.main" sx={{ display: 'flex', alignSelf: 'flex-end' }}>{icon}</Box>
        <Box>
          <Typography variant="caption" color="text.secondary">{label}</Typography>
          <Typography variant="h5" color="secondary.main" fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
          {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
        </Box>
      </Stack>
    </Paper>
  );
}

function HistoryDialog({ open, onClose, movements, loading, dateLabel, litersLabel, currency }: {
  open: boolean;
  onClose: () => void;
  movements: FuelMovement[];
  loading: boolean;
  dateLabel: (value: unknown, includeTime?: boolean) => string;
  litersLabel: (value: number | null) => string;
  currency: Intl.NumberFormat;
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Histórico da bomba</DialogTitle>
      <DialogContent>
        {loading && <LinearProgress />}
        {!loading && movements.length === 0 && <Alert severity="info">Esta bomba ainda não possui histórico compatível.</Alert>}
        <Stack divider={<Divider flexItem />}>
          {movements.map((movement) => {
            const type = movement.tipo;
            const label = type === 'entrada' ? 'Entrada de diesel' : type === 'ajuste' ? 'Ajuste' : 'Abastecimento / saída';
            return (
              <Stack key={movement.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ py: 2 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Chip size="small" color={type === 'entrada' ? 'success' : type === 'ajuste' ? 'warning' : 'default'} label={label} />
                    <Typography variant="subtitle2">{dateLabel(movement.data, true)}</Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                    {movement.motivo || 'Movimentação de combustível'}
                    {movement.placa ? ` • Veículo: ${movement.placa}` : ''}
                    {movement.obra ? ` • Obra: ${movement.obra}` : ''}
                  </Typography>
                  {movement.responsavel && <Typography variant="caption" color="text.secondary">Responsável: {movement.responsavel}</Typography>}
                </Box>
                <Box sx={{ textAlign: { sm: 'right' }, minWidth: 150 }}>
                  <Typography fontWeight={800} color={type === 'entrada' ? 'success.main' : 'text.primary'}>
                    {type === 'entrada' ? '+' : type === 'saida' ? '−' : ''}{litersLabel(storedTenthsToLiters(movement.litrosComprados))}
                  </Typography>
                  {typeof movement.preco === 'number' && <Typography variant="body2">{currency.format(movement.preco)}</Typography>}
                  {movement.lote && <Typography variant="caption" color="text.secondary">Lote {movement.lote}</Typography>}
                </Box>
              </Stack>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Fechar</Button></DialogActions>
    </Dialog>
  );
}
