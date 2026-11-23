import { Alert, Box, Button, IconButton, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import GetAppRoundedIcon from '@mui/icons-material/GetAppRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { useState, useSyncExternalStore } from 'react';
import { assinarInstalar, instalarPorBotao, podeInstalarPorBotao } from '../appMotorista';

/** iPhone/iPad (o iPad novo se apresenta como Mac com toque). */
const ehIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Aberto pelo ícone da tela inicial, não pelo navegador. */
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
/** Celular ou tablet (tela de toque); no computador, o aviso não aparece. */
const celular = () => window.matchMedia('(pointer: coarse)').matches;

const CHAVE_FECHADO = 'ledur-aviso-instalar-fechado';
const lerFechado = () => { try { return sessionStorage.getItem(CHAVE_FECHADO) === '1'; } catch { return false; } };

/**
 * "Quer instalar o app?" nas telas /motorista abertas no navegador do celular (o QR Code leva a /motorista). No Android,
 * o botão Instalar abre a janela do Chrome (sem ela, o passo a passo do menu ⋮); no iPhone, que não deixa um site
 * instalar sozinho, o passo a passo do Compartilhar. `antesDoLogin`: na tela de login, pede para instalar primeiro (no
 * iPhone, o app instalado não aproveita o login feito no Safari). Fechado, some até fechar o navegador.
 */
export default function AvisoInstalar({ antesDoLogin = false }: { antesDoLogin?: boolean }) {
  const porBotao = useSyncExternalStore(assinarInstalar, podeInstalarPorBotao);
  const [fechado, setFechado] = useState(lerFechado);
  if (fechado || instalado() || !celular()) return null;
  const iphone = ehIphone();
  const fechar = () => {
    try { sessionStorage.setItem(CHAVE_FECHADO, '1'); } catch { /* sem armazenamento, fecha só agora */ }
    setFechado(true);
  };
  return (
    <Alert
      severity="info"
      icon={iphone ? <IosShareRoundedIcon /> : <GetAppRoundedIcon />}
      action={<IconButton aria-label="Fechar aviso" color="inherit" size="small" onClick={fechar}><CloseRoundedIcon fontSize="small" /></IconButton>}
      sx={{ mb: 2, textAlign: 'left' }}
    >
      <Typography fontWeight={700}>Quer instalar o app Motorista?</Typography>
      {antesDoLogin && <Typography variant="body2">Instale primeiro e entre pelo ícone: é lá que você vai usar.</Typography>}
      {iphone ? (
        <Box component="ol" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          <li>Toque em <strong>Compartilhar</strong> <IosShareRoundedIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom' }} /> (o quadrado com a seta, na barra do Safari).</li>
          <li>Escolha <strong>Adicionar à Tela de Início</strong> e toque em <strong>Adicionar</strong>.</li>
          <li>Abra sempre pelo ícone <strong>Motorista</strong>.</li>
        </Box>
      ) : porBotao ? (
        <Button variant="contained" size="small" startIcon={<GetAppRoundedIcon />} sx={{ mt: 1 }} onClick={() => void instalarPorBotao()}>Instalar</Button>
      ) : (
        <Box component="ol" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          <li>No Chrome, toque no menu <MoreVertIcon sx={{ fontSize: 16, verticalAlign: 'text-bottom' }} /> (no canto de cima).</li>
          <li>Escolha <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
          <li>Abra sempre pelo ícone <strong>Motorista</strong>.</li>
        </Box>
      )}
      {iphone && <Typography variant="body2" sx={{ mt: 0.5 }}>Sem instalar, o iPhone pode apagar o que ficou guardado no celular (rascunhos e o que falta enviar).</Typography>}
    </Alert>
  );
}
