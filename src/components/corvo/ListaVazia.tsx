import { Stack, Typography } from '@mui/material';
import { GridOverlay, useGridApiContext } from '@mui/x-data-grid';
import Corvo from './Corvo';

// Tabelas (DataGrid) sem linhas: o corvo procura (bica, cisca, "?") sobre a mensagem da própria tabela (noRowsLabel ou,
// com filtro, noResultsOverlayLabel). Ligadas a todas as tabelas pelo tema (ledurTheme.ts).
function Vazia({ chave }: { chave: 'noRowsLabel' | 'noResultsOverlayLabel' }) {
  const api = useGridApiContext();
  return (
    <GridOverlay>
      <Stack spacing={1} alignItems="center">
        <Corvo animacao="cabeca" pixel={3} />
        <Typography variant="body2" color="text.secondary">{api.current.getLocaleText(chave)}</Typography>
      </Stack>
    </GridOverlay>
  );
}

export const SemLinhas = () => <Vazia chave="noRowsLabel" />;
export const SemResultados = () => <Vazia chave="noResultsOverlayLabel" />;
