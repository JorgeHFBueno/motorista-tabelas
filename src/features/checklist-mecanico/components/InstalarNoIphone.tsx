import { Alert, Box, Typography } from '@mui/material';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';

/** iPhone/iPad no Safari, ainda fora da Tela de Início. */
function precisaInstalar(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalado = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !instalado;
}

/**
 * Passo a passo para instalar no iPhone. Fora da Tela de Início o iPhone pode apagar os dados do site (rascunho e
 * checklists a enviar) depois de cerca de 7 dias sem uso.
 */
export default function InstalarNoIphone() {
  if (!precisaInstalar()) return null;
  return (
    <Alert severity="info" icon={<IosShareRoundedIcon />} sx={{ mb: 2 }}>
      <Typography fontWeight={700}>Instale o checklist no iPhone</Typography>
      <Box component="ol" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
        <li>Toque em <strong>Compartilhar</strong> (o quadrado com a seta, na barra do Safari).</li>
        <li>Escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.</li>
        <li>Abra sempre pelo ícone <strong>Ledur</strong> da Tela de Início.</li>
      </Box>
      <Typography variant="body2" sx={{ mt: 0.5 }}>Sem instalar, o iPhone pode apagar checklists guardados no aparelho.</Typography>
    </Alert>
  );
}
