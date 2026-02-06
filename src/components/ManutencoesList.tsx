import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Timestamp } from 'firebase/firestore';

export type FonteManutencao = 'manutencoes' | 'manutencoes-legado';

export interface ManutencaoListItem {
  id: string;
  collection: FonteManutencao;
  identificador: string;
  data: Timestamp | null;
  resumo: string;
}

interface ManutencoesListProps {
  items: ManutencaoListItem[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  search: string;
  selectedId: string | null;
  fonte: FonteManutencao;
  hasMore: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (item: ManutencaoListItem) => void;
  onLoadMore: () => void;
  onFonteChange: (fonte: FonteManutencao) => void;
}

const formatDate = (value: Timestamp | null) => {
  if (!value) return '—';
  return value.toDate().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

export default function ManutencoesList({
  items,
  loading,
  loadingMore,
  error,
  search,
  selectedId,
  fonte,
  hasMore,
  onSearchChange,
  onSelect,
  onLoadMore,
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
        <TextField
          size="small"
          placeholder="Buscar por placa, identificador ou fornecedor"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      <Box
        sx={{
          flex: 1,
          minHeight: 240,
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
          <List disablePadding>
            {items.map((item) => (
              <ListItemButton
                key={`${item.collection}-${item.id}`}
                selected={selectedId === item.id}
                onClick={() => onSelect(item)}
                sx={{ px: 2, py: 1.5 }}
              >
                <ListItemText
                  primary={item.identificador}
                  secondary={
                    <Stack spacing={0.5}>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(item.data)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {item.resumo || 'Sem resumo'}
                      </Typography>
                    </Stack>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </Box>

      {hasMore && (
        <Button
          variant="outlined"
          onClick={onLoadMore}
          disabled={loadingMore}
          startIcon={loadingMore ? <CircularProgress size={16} /> : undefined}
        >
          {loadingMore ? 'Carregando...' : 'Carregar mais'}
        </Button>
      )}
    </Stack>
  );
}