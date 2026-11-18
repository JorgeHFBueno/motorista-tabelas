import { Box } from '@mui/material';
import type { ReactNode } from 'react';
import { CORES_LEDUR } from '../appMotorista';

/** Fundo e largura das telas do motorista, como o app Flutter (fundo CoresLedur.fundo). */
export default function PaginaMotorista({ children }: { children: ReactNode }) {
  return (
    // flex 1: ocupa o resto da altura, abaixo do cabeçalho; width 100%: na coluna flex, com mx auto, a caixa de dentro
    // encolheria ou cresceria conforme o conteúdo.
    <Box sx={{ flex: 1, width: '100%', bgcolor: CORES_LEDUR.fundo }}>
      <Box sx={{ width: '100%', maxWidth: 640, mx: 'auto', px: 2, py: 2, pb: 6 }}>{children}</Box>
    </Box>
  );
}
