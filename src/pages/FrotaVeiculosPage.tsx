import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Snackbar,
    Stack,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';

type TipoVeiculo = 'PLACA' | 'EXTRA';

type Veiculo = {
    id: string;
    ativo?: boolean;
    categoria?: string;
    placa?: string;
    extra?: string;
    quilometragemInicial?: number;
    quilometragemUltima?: number;
    dataUltimaAtualizacao?: unknown;
};

type VeiculoForm = {
    ativo: boolean;
    placa: string;
    extra: string;
    quilometragemInicial: string;
    quilometragemUltima: string;
};

const DEFAULT_FORM: VeiculoForm = {
    ativo: false,
    placa: '',
    extra: '',
    quilometragemInicial: '',
    quilometragemUltima: '',
};

const DEBUG = true;

function toDate(raw: unknown): Date | null {
    if (!raw) return null;
    if (raw instanceof Date) return raw;
    if (typeof (raw as { toDate?: () => Date }).toDate === 'function') {
        return (raw as { toDate: () => Date }).toDate();
    }
    if (typeof raw === 'object' && raw !== null && 'seconds' in raw) {
        const seconds = (raw as { seconds?: number }).seconds ?? 0;
        const nanoseconds = (raw as { nanoseconds?: number }).nanoseconds ?? 0;
        return new Date(seconds * 1000 + nanoseconds / 1e6);
    }
    const parsed = new Date(raw as string);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function asNumber(raw: unknown): number | null {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string') {
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

export default function FrotaVeiculosPage() {
    const navigate = useNavigate();
    const [tipo, setTipo] = useState<TipoVeiculo>('PLACA');
    const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Veiculo | null>(null);
    const [form, setForm] = useState<VeiculoForm>(DEFAULT_FORM);
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState<{
        open: boolean;
        severity: 'success' | 'error';
        message: string;
    }>({
        open: false,
        severity: 'success',
        message: '',
    });

    const dateFormatter = useMemo(
        () =>
            new Intl.DateTimeFormat('pt-BR', {
                dateStyle: 'short',
                timeStyle: 'short',
            }),
        [],
    );
    const numberFormatter = useMemo(() => new Intl.NumberFormat('pt-BR'), []);

    // Evita spam no console (logar 1x por row/campo)
    const loggedOnceRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        let active = true;
        async function loadVeiculos() {
            setLoading(true);
            setError(null);
            try {
                const orderField = tipo === 'PLACA' ? 'placa' : 'extra';
                const veiculosQuery = query(collection(db, 'veiculos'), orderBy(orderField));
                const snapshot = await getDocs(veiculosQuery);
                if (!active) return;

                const data = snapshot.docs.map((docSnap) => ({
                    id: docSnap.id,
                    ...(docSnap.data() as Omit<Veiculo, 'id'>),
                }));

                if (DEBUG) {
                    console.group('[FROTA DEBUG] loadVeiculos');
                    console.log('tipo:', tipo, 'orderField:', orderField, 'count:', data.length);
                    console.table(
                        data.slice(0, 10).map((v) => ({
                            id: v.id,
                            placa: v.placa,
                            extra: v.extra,
                            kmInicial_raw: (v as any).quilometragemInicial,
                            kmInicial_type: typeof (v as any).quilometragemInicial,
                            kmUltima_raw: (v as any).quilometragemUltima,
                            kmUltima_type: typeof (v as any).quilometragemUltima,
                            data_raw: (v as any).dataUltimaAtualizacao,
                            data_type: typeof (v as any).dataUltimaAtualizacao,
                            keys: Object.keys(v as any).join(', '),
                        })),
                    );
                    console.groupEnd();
                }

                setVeiculos(data);
            } catch (err) {
                console.error('Erro ao carregar veículos', err);
                if (active) {
                    setError('Não foi possível carregar os veículos. Tente novamente.');
                }
            } finally {
                if (active) setLoading(false);
            }
        }

        loadVeiculos();
        return () => {
            active = false;
        };
    }, [tipo]);

    const rows = useMemo(() => {
        const filtered = veiculos.filter((item) => {
            if (item.categoria) {
                return item.categoria === tipo;
            }
            if (tipo === 'PLACA') {
                return Boolean(item.placa);
            }
            return Boolean(item.extra);
        });

        if (DEBUG) {
            console.group('[FROTA DEBUG] rows/filter');
            console.log('tipo:', tipo, 'rows:', filtered.length, 'veiculos:', veiculos.length);
            console.table(
                filtered.slice(0, 5).map((v) => ({
                    id: v.id,
                    placa: v.placa,
                    extra: v.extra,
                    kmInicial_raw: (v as any).quilometragemInicial,
                    kmUltima_raw: (v as any).quilometragemUltima,
                    data_raw: (v as any).dataUltimaAtualizacao,
                })),
            );
            console.groupEnd();
        }

        return filtered;
    }, [tipo, veiculos]);

    const columns: GridColDef[] = useMemo(() => {
        const fieldLabel = tipo === 'PLACA' ? 'Placa' : 'Extra';
        const fieldName = tipo === 'PLACA' ? 'placa' : 'extra';

        const logOnce = (key: string, payload: unknown) => {
            if (!DEBUG) return;
            if (loggedOnceRef.current.has(key)) return;
            loggedOnceRef.current.add(key);
            console.log(key, payload);
        };

        return [
            {
                field: 'ativo',
                headerName: 'Ativo',
                minWidth: 90,
                renderCell: ({ value }) => <Checkbox checked={Boolean(value)} disabled />,
            },
            { field: fieldName, headerName: fieldLabel, minWidth: 140, flex: 1 },
            {
                field: 'quilometragemInicial',
                headerName: 'KM inicial',
                minWidth: 140,
                flex: 1,
                valueGetter: (params: any) => params?.row?.quilometragemInicial,
                valueFormatter: (params: any) => {
                    const n = asNumber(params?.value);
                    return n !== null ? numberFormatter.format(n) : '—';
                },
            },
            {
                field: 'quilometragemUltima',
                headerName: 'KM última',
                minWidth: 140,
                flex: 1,
                valueGetter: (params: any) => params?.row?.quilometragemUltima,
                valueFormatter: (params: any) => {
                    const n = asNumber(params?.value);
                    return n !== null ? numberFormatter.format(n) : '—';
                },
            },
            {
                field: 'dataUltimaAtualizacao',
                headerName: 'Última atualização',
                minWidth: 180,
                flex: 1.2,
                valueGetter: (params: any) => toDate(params?.row?.dataUltimaAtualizacao),
                renderCell: (params: any) =>
                    params?.value instanceof Date ? dateFormatter.format(params.value) : '—',
            },
        ];
    }, [dateFormatter, numberFormatter, tipo]);

    function openEditor(row: Veiculo) {
        setEditing(row);
        setForm({
            ativo: Boolean(row.ativo),
            placa: row.placa ?? '',
            extra: row.extra ?? '',
            quilometragemInicial: row.quilometragemInicial !== undefined ? String(row.quilometragemInicial) : '',
            quilometragemUltima: row.quilometragemUltima !== undefined ? String(row.quilometragemUltima) : '',
        });

        if (DEBUG) {
            console.group('[FROTA DEBUG] openEditor');
            console.log('row.id:', row.id);
            console.log('row keys:', Object.keys(row as any));
            console.log('kmInicial:', (row as any).quilometragemInicial, 'type:', typeof (row as any).quilometragemInicial);
            console.log('kmUltima:', (row as any).quilometragemUltima, 'type:', typeof (row as any).quilometragemUltima);
            console.log('dataUltimaAtualizacao raw:', (row as any).dataUltimaAtualizacao);
            const d = toDate((row as any).dataUltimaAtualizacao);
            console.log('dataUltimaAtualizacao parsed:', d, 'isDate:', d instanceof Date, 'time:', d ? d.getTime() : null);
            console.groupEnd();
        }
    }

    function closeEditor() {
        if (saving) return;
        setEditing(null);
        setForm(DEFAULT_FORM);
    }

    async function handleSave() {
        if (!editing) return;

        const placa = form.placa.trim();
        const extra = form.extra.trim();

        if (tipo === 'PLACA' && !placa) {
            setSnackbar({ open: true, severity: 'error', message: 'Informe a placa.' });
            return;
        }
        if (tipo === 'EXTRA' && !extra) {
            setSnackbar({ open: true, severity: 'error', message: 'Informe o código extra.' });
            return;
        }

        if (!form.quilometragemInicial.trim() || !form.quilometragemUltima.trim()) {
            setSnackbar({
                open: true,
                severity: 'error',
                message: 'Informe as quilometragens inicial e última.',
            });
            return;
        }

        const kmInicial = Number(form.quilometragemInicial);
        const kmUltima = Number(form.quilometragemUltima);

        if (!Number.isInteger(kmInicial) || !Number.isInteger(kmUltima)) {
            setSnackbar({
                open: true,
                severity: 'error',
                message: 'Quilometragens devem ser números inteiros.',
            });
            return;
        }

        setSaving(true);
        try {
            const updateData: Partial<Veiculo> = {
                ativo: form.ativo,
                quilometragemInicial: kmInicial,
                quilometragemUltima: kmUltima,
            };

            if (tipo === 'PLACA') {
                updateData.placa = placa;
            } else {
                updateData.extra = extra;
            }

            await updateDoc(doc(db, 'veiculos', editing.id), {
                ...updateData,
                dataUltimaAtualizacao: serverTimestamp(),
            });

            setVeiculos((prev) =>
                prev.map((item) =>
                    item.id === editing.id
                        ? {
                            ...item,
                            ...updateData,
                            dataUltimaAtualizacao: new Date(),
                        }
                        : item,
                ),
            );

            setSnackbar({ open: true, severity: 'success', message: 'Veículo atualizado com sucesso.' });
            closeEditor();
        } catch (err) {
            console.error('Erro ao atualizar veículo', err);
            setSnackbar({ open: true, severity: 'error', message: 'Erro ao atualizar veículo.' });
        } finally {
            setSaving(false);
        }
    }

    const emptyLabel =
        tipo === 'PLACA' ? 'Nenhum veículo do tipo PLACA encontrado.' : 'Nenhum veículo do tipo EXTRA encontrado.';

    return (
        <Container sx={{ py: 3 }}>
            <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={2}
                alignItems={{ xs: 'flex-start', md: 'center' }}
                justifyContent="space-between"
            >
                <Typography variant="h4">Frota (Veículos)</Typography>
                <Button variant="outlined" onClick={() => navigate('/registros')}>
                    Ir para Registros
                </Button>
            </Stack>

            <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
                mt={3}
                alignItems={{ xs: 'stretch', sm: 'center' }}
            >
                <Typography variant="subtitle1" fontWeight={600}>
                    Tipo de veículo
                </Typography>

                <ToggleButtonGroup value={tipo} exclusive onChange={(_event, newValue) => {
                    const v = newValue as TipoVeiculo | null;
                    if (v !== null) setTipo(v);
                }}
                    aria-label="Filtro de tipo de veículo">
                    <ToggleButton value={'PLACA' as TipoVeiculo} aria-label="Exibir placas">
                        Exibir PLACA
                    </ToggleButton>
                    <ToggleButton value={'EXTRA' as TipoVeiculo} aria-label="Exibir extras">
                        Exibir EXTRA
                    </ToggleButton>
                </ToggleButtonGroup>


            </Stack>

            <Box mt={3}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Box sx={{ width: '100%', height: 560 }}>
                    <DataGrid
                        rows={rows}
                        columns={columns}
                        loading={loading}
                        disableRowSelectionOnClick
                        onRowClick={(params) => openEditor(params.row as Veiculo)}
                        getRowId={(row) => row.id}
                        density="compact"
                    />
                </Box>

                {!loading && rows.length === 0 && !error && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                        {emptyLabel}
                    </Alert>
                )}
            </Box>

            <Dialog open={Boolean(editing)} onClose={closeEditor} maxWidth="sm" fullWidth>
                <DialogTitle>Editar veículo</DialogTitle>
                <DialogContent>
                    {editing ? (
                        <Stack spacing={2} mt={1}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={form.ativo}
                                        onChange={(event) => setForm((prev) => ({ ...prev, ativo: event.target.checked }))}
                                    />
                                }
                                label="Ativo"
                            />

                            {tipo === 'PLACA' ? (
                                <TextField
                                    label="Placa"
                                    value={form.placa}
                                    onChange={(event) => setForm((prev) => ({ ...prev, placa: event.target.value }))}
                                    fullWidth
                                    required
                                />
                            ) : (
                                <TextField
                                    label="Extra"
                                    value={form.extra}
                                    onChange={(event) => setForm((prev) => ({ ...prev, extra: event.target.value }))}
                                    fullWidth
                                    required
                                />
                            )}

                            <TextField
                                label="Quilometragem inicial"
                                type="number"
                                value={form.quilometragemInicial}
                                onChange={(event) => setForm((prev) => ({ ...prev, quilometragemInicial: event.target.value }))}
                                fullWidth
                                required
                            />
                            <TextField
                                label="Quilometragem última"
                                type="number"
                                value={form.quilometragemUltima}
                                onChange={(event) => setForm((prev) => ({ ...prev, quilometragemUltima: event.target.value }))}
                                fullWidth
                                required
                            />

                            <TextField
                                label="Última atualização"
                                value={(() => {
                                    const d = toDate(editing.dataUltimaAtualizacao);
                                    return d ? dateFormatter.format(d) : '—';
                                })()}
                                fullWidth
                                disabled
                            />
                        </Stack>
                    ) : (
                        <Box display="flex" alignItems="center" justifyContent="center" py={3}>
                            <CircularProgress size={22} />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeEditor} disabled={saving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
                    severity={snackbar.severity}
                    variant="filled"
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}
