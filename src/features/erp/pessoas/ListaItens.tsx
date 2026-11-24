import { useState } from 'react';
import {
  Box, Button, IconButton, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';

// Lista editável da ficha (telefones, e-mails, contatos, sócios...), como as listas do ERP: uma linha por item, um campo por
// coluna. Demonstração: as linhas ficam só na tela.
export type ColunaItem = { rotulo: string; opcoes?: string[]; data?: true; largura?: number };

export default function ListaItens({ titulo, colunas, inicial = [], botao = 'Adicionar' }: {
  titulo: string; colunas: ColunaItem[]; inicial?: string[][]; botao?: string;
}) {
  const [linhas, setLinhas] = useState(inicial);
  const mudar = (i: number, j: number, valor: string) =>
    setLinhas((ls) => ls.map((l, k) => (k === i ? colunas.map((_, m) => (m === j ? valor : l[m] ?? '')) : l)));

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2" fontWeight={700}>{titulo}</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={() => setLinhas((ls) => [...ls, colunas.map(() => '')])}>{botao}</Button>
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              {colunas.map((c) => <TableCell key={c.rotulo} sx={{ fontWeight: 700 }}>{c.rotulo}</TableCell>)}
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {linhas.map((linha, i) => (
              <TableRow key={i}>
                {colunas.map((c, j) => (
                  <TableCell key={c.rotulo} sx={{ minWidth: c.largura ?? 140 }}>
                    <TextField
                      variant="standard" fullWidth select={Boolean(c.opcoes)} type={c.data ? 'date' : 'text'} value={linha[j] ?? ''}
                      onChange={(e) => mudar(i, j, e.target.value)} slotProps={{ htmlInput: { 'aria-label': c.rotulo } }}
                    >
                      {c.opcoes?.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </TextField>
                  </TableCell>
                ))}
                <TableCell padding="checkbox">
                  <IconButton size="small" aria-label="Tirar a linha" onClick={() => setLinhas((ls) => ls.filter((_, k) => k !== i))}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!linhas.length && (
              <TableRow>
                <TableCell colSpan={colunas.length + 1}><Typography variant="body2" color="text.secondary">Nenhum item.</Typography></TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
