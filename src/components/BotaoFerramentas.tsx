import { useState } from 'react';
import { Box, ButtonBase, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { PenTool, Wrench, X } from 'lucide-react';
import CanvasTela from './CanvasTela';

// Ferramentas, no cabeçalho ao lado do sino, só para o adm2: um painel como o dos Avisos com as ferramentas de tela.
// A primeira é o Canvas (desenhar sobre a tela, CanvasTela.tsx).

type Props = { botaoSx: object };

export default function BotaoFerramentas({ botaoSx }: Props) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const [canvas, setCanvas] = useState(false);

  return (
    <>
      <Tooltip title="Ferramentas">
        <IconButton aria-label="Ferramentas" onClick={(e) => setAncora(e.currentTarget)} sx={{ ...botaoSx, width: 40, height: 40 }}>
          <Wrench size={20} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(ancora)} anchorEl={ancora} onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxWidth: 'calc(100vw - 16px)' } } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', pl: 2.25, pr: 1.5, pt: 1.75, pb: 0.75 }}>
          <Typography component="h3" sx={{ fontSize: 22, fontWeight: 600, flex: 1 }}>Ferramentas</Typography>
          <Tooltip title="Fechar">
            <IconButton size="small" aria-label="Fechar as ferramentas" onClick={() => setAncora(null)}><X size={18} /></IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ px: 1.5, pt: 0.5, pb: 1.5 }}>
          <ButtonBase
            onClick={() => { setAncora(null); setCanvas(true); }}
            sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, width: '100%', textAlign: 'left', p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'action.hover' } }}
          >
            <Box sx={{ flex: 'none', width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'secondary.main', color: '#fff' }}>
              <PenTool size={17} />
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: 13 }}>
              <strong>Canvas</strong>
              <Box component="span" sx={{ color: 'text.secondary' }}>
                Desenhe sobre a tela, com pincel livre ou formas, para revisar uma tela com a equipe ou numa apresentação. Esc fecha.
              </Box>
            </Box>
          </ButtonBase>
        </Box>
      </Popover>
      {canvas && <CanvasTela onFechar={() => setCanvas(false)} />}
    </>
  );
}
