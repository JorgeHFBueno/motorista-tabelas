import {
  Alert,
  Box,
  Button,
  List,
  ListItemButton,
  Skeleton,
  Stack,  
  Typography,
} from '@mui/material';
import { Timestamp } from 'firebase/firestore';

// 'erp' não é coleção: são as linhas da Query 47 do ERP (getVehicleErpCosts), só leitura.
export type FonteEvento = 'atividades' | '03-combustivel' | 'manutencoes' | 'erp';
export type TipoEvento = 'atividade' | 'abastecimento' | 'manutencao2026' | 'manutencaoErp';

export interface MasterDetailListItem  {
  id: string;
  collection: FonteEvento;
  tipo: TipoEvento;
  data: Date | null;
  categoria: string | null;
  valor: number | null;
  /** Texto da última coluna quando o item não tem valor (ex.: km da atividade). */
  valorTexto?: string | null;
}

export interface MasterDetailFilters {
  atividades: boolean;
  abastecimento: boolean;
  manutencoes2026: boolean;
  manutencoesErp: boolean;
}

export type MasterDetailCounts = Record<keyof MasterDetailFilters, number>;

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

const FILTROS: Array<{ key: keyof MasterDetailFilters; label: string }> = [
  { key: 'atividades', label: 'Atividades' },
  { key: 'abastecimento', label: 'Abastecimento' },
  { key: 'manutencoes2026', label: 'Manutenções FROTA' },
  { key: 'manutencoesErp', label: 'Manutenções ERP' },
];

// Fontes do detalhe do veículo, em linha, acima da lista.
export function RegistrosFiltros({ filters, counts, onToggleFilter }: Pick<ManutencoesListProps, 'filters' | 'counts' | 'onToggleFilter'>) {
  return (
    <Stack direction="row" flexWrap="wrap" useFlexGap spacing={2} role="group" aria-label="Fontes dos registros">
      {FILTROS.map(({ key, label }) => (
        <Button
          key={key}
          variant={filters[key] ? 'contained' : 'outlined'}
          aria-pressed={filters[key]}
          onClick={() => onToggleFilter(key, !filters[key])}
        >
          {`${label} (${counts[key]})`}
        </Button>
      ))}
    </Stack>
  );
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
  onSelect,
}: Pick<ManutencoesListProps, 'items' | 'loading' | 'error' | 'selectedId' | 'selectedCollection' | 'filters' | 'onSelect'>) {
  const hasFilters = Object.values(filters).some(Boolean);
  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
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
                      {item.valor === null && item.valorTexto ? item.valorTexto : formatValor(item.valor)}
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