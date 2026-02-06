import {
  Alert,
  Box,  
  List,
  ListItemButton,
  Skeleton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Timestamp } from 'firebase/firestore';

export type FonteManutencao = 'manutencoes' | 'manutencoes-legado';

export interface ManutencaoListItem {
  id: string;
  collection: FonteManutencao;
  data: Timestamp | null;
  categoria: string | null;
  valor: number | null;
}

interface ManutencoesListProps {
  items: ManutencaoListItem[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  fonte: FonteManutencao;
  onSelect: (item: ManutencaoListItem) => void;
  onFonteChange: (fonte: FonteManutencao) => void;
}

const formatDate = (value: Timestamp | null) => {
  if (!value) return '—';
  return value.toDate().toLocaleDateString('pt-BR', {
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

const numberFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatValor = (value: number | null) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return currencyFormatter.format(numeric) || numberFormatter.format(numeric);
};

export default function ManutencoesList({
  items,
  loading,
  error,
  selectedId,
  fonte,
  onSelect,
  onFonteChange,
}: ManutencoesListProps) {
  return (
    <Stack spacing={2} sx={{ height: '100%' }}>
      <Stack spacing={1}>
        <Typography variant="h6">Manutenções</Typography>
        <ToggleButtonGroup
          value={fonte}
          exclusive
          onChange={(_, value) => value && onFonteChange(value)}
          size="small"
          color="primary"
        >
          <ToggleButton value="manutencoes">Manutenções - 2026</ToggleButton>
          <ToggleButton value="manutencoes-legado">Manutenções - Legado</ToggleButton>
        </ToggleButtonGroup>        
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
        ) : items.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" p={4}>
            <Typography variant="body2" color="text.secondary">
              Nenhuma manutenção encontrada.
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
                  selected={selectedId === item.id}
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