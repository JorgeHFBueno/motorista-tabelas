import {
  Alert,
  Box,  
  Checkbox,
  FormControlLabel,
  List,
  ListItemButton,
  Skeleton,
  Stack,  
  Typography,
} from '@mui/material';
import { Timestamp } from 'firebase/firestore';

export type FonteEvento = '03-combustivel' | 'manutencoes' | 'manutencoes-legado';
export type TipoEvento = 'abastecimento' | 'manutencao2026' | 'manutencaoLegado';

export interface MasterDetailListItem  {
  id: string;
  collection: FonteEvento;
  tipo: TipoEvento;
  data: Date | null;
  categoria: string | null;
  valor: number | null;
}

export interface MasterDetailFilters {
  abastecimento: boolean;
  manutencoes2026: boolean;
  manutencoesLegado: boolean;
}

export interface MasterDetailCounts {
  abastecimento: number;
  manutencoes2026: number;
  manutencoesLegado: number;
}

interface ManutencoesListProps {
  items: MasterDetailListItem[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  selectedCollection: FonteEvento | null;
  filters: MasterDetailFilters;
  counts: MasterDetailCounts;
  onSelect: (item: MasterDetailListItem) => void;
  onToggleFilter: (key: keyof MasterDetailFilters, value: boolean) => void;
}

const formatDate = (value: Date  | null) => {
  if (!value) return '—';
  return value.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatValor = (value: number | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return currencyFormatter.format(numeric);
};

export default function ManutencoesList({
  items,
  loading,
  error,
  selectedId,
  selectedCollection,
  filters,
  counts,
  onSelect,
  onToggleFilter,
}: ManutencoesListProps) {
  const hasFilters = filters.abastecimento || filters.manutencoes2026 || filters.manutencoesLegado;
  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Stack spacing={1}>
        <Typography variant="h6">Registros</Typography>
        <Stack spacing={0.5}>
          <FormControlLabel
            control={
              <Checkbox
                checked={filters.abastecimento}
                onChange={(event) => onToggleFilter('abastecimento', event.target.checked)}
              />
            }
            label={`Abastecimento (${counts.abastecimento})`}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filters.manutencoes2026}
                onChange={(event) => onToggleFilter('manutencoes2026', event.target.checked)}
              />
            }
            label={`Manutenções - 2026 (${counts.manutencoes2026})`}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={filters.manutencoesLegado}
                onChange={(event) => onToggleFilter('manutencoesLegado', event.target.checked)}
              />
            }
            label={`Manutenções - Legado (${counts.manutencoesLegado})`}
          />
        </Stack>      
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Box
        sx={{
          flex: 1,
          minHeight: 240,
          maxHeight: 480,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          overflowY: 'auto',
        }}
      >
        {loading ? (
          <Stack spacing={1} p={2}>
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} variant="rounded" height={56} />
            ))}
          </Stack>
           ) : !hasFilters ? (
          <Stack alignItems="center" justifyContent="center" p={4}>
            <Typography variant="body2" color="text.secondary">
              Selecione ao menos um filtro.
            </Typography>
          </Stack>
        ) : items.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" p={4}>
            <Typography variant="body2" color="text.secondary">
              Nenhum registro encontrado.
            </Typography>
          </Stack>
        ) : (
          <>
            <Box
              sx={{
                px: 2,
                py: 1,
                borderBottom: '1px solid',
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
            >
              <Stack direction="row" spacing={2}>
                <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>
                  Data
                </Typography>
                <Typography variant="caption" sx={{ flex: 1.4, fontWeight: 600 }}>
                  Categoria
                </Typography>
                <Typography variant="caption" sx={{ flex: 1, fontWeight: 600, textAlign: 'right' }}>
                  Valor
                </Typography>
              </Stack>
            </Box>
            <List disablePadding>
              {items.map((item) => (
                <ListItemButton
                  key={`${item.collection}-${item.id}`}
                  selected={selectedId === item.id && selectedCollection === item.collection}
                  onClick={() => onSelect(item)}
                  sx={{ px: 2, py: 1.25 }}
                >
                  <Stack direction="row" spacing={2} sx={{ width: '100%' }}>
                    <Typography variant="body2" sx={{ flex: 1 }}>
                      {formatDate(item.data)}
                    </Typography>
                    <Typography variant="body2" sx={{ flex: 1.4 }}>
                      {item.categoria || '—'}
                    </Typography>
                    <Typography variant="body2" sx={{ flex: 1, textAlign: 'right' }}>
                      {formatValor(item.valor)}
                    </Typography>
                  </Stack>
                </ListItemButton>
              ))}
            </List>
          </>
        )}
      </Box>     
    </Stack>
  );
}