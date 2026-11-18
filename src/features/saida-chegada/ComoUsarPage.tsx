import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import AndroidIcon from '@mui/icons-material/Android';
import AppleIcon from '@mui/icons-material/Apple';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** iPhone/iPad (o iPad novo se apresenta como Mac com toque). */
const ehIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Aberto pelo ícone da tela inicial, não pelo navegador. */
const instalado = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function Secao({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          {icone}
          <Typography variant="h6" fontWeight={800}>{titulo}</Typography>
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function Passos({ itens }: { itens: ReactNode[] }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 2.5, '& li': { mb: 0.75 } }}>
      {itens.map((item, i) => <li key={i}><Typography component="span">{item}</Typography></li>)}
    </Box>
  );
}

function InstalarAndroid() {
  return (
    <Secao icone={<AndroidIcon sx={{ color: '#3DDC84' }} />} titulo="Instalar no Android">
      <Passos itens={[
        <>Abra <strong>{window.location.host}</strong> no <strong>Chrome</strong> e entre com seu celular e senha.</>,
        <>Toque no menu <MoreVertIcon fontSize="small" sx={{ verticalAlign: 'middle' }} /> (os três pontinhos, no canto de cima).</>,
        <>Toque em <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>) e confirme em <strong>Instalar</strong>.</>,
        <>Pronto: o ícone <strong>Ledur</strong> aparece junto dos outros apps. Abra sempre por ele.</>,
      ]} />
    </Secao>
  );
}

function InstalarIphone() {
  return (
    <Secao icone={<AppleIcon />} titulo="Instalar no iPhone">
      <Passos itens={[
        <>Abra <strong>{window.location.host}</strong> no <strong>Safari</strong> (no iPhone, precisa ser o Safari) e entre com seu celular e senha.</>,
        <>Toque em <strong>Compartilhar</strong> <IosShareRoundedIcon fontSize="small" sx={{ verticalAlign: 'middle' }} /> (o quadrado com a seta, na barra do Safari).</>,
        <>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.</>,
        <>Pronto: abra sempre pelo ícone <strong>Ledur</strong> da Tela de Início.</>,
      ]} />
      <Alert severity="warning" sx={{ mt: 1.5 }}>
        Sem instalar, o iPhone pode apagar o que ficou guardado no aparelho depois de alguns dias sem uso, inclusive lançamentos ainda não enviados.
      </Alert>
    </Secao>
  );
}

/** /motorista/como-usar: o que fazer em cada tela e como instalar no celular (Android e iPhone). */
export default function ComoUsarPage() {
  const navigate = useNavigate();
  const iphone = ehIphone();
  return (
    // width 100%: na coluna flex da página, com mx auto, a caixa encolheria ou cresceria conforme o conteúdo.
    <Box sx={{ width: '100%', maxWidth: 640, mx: 'auto', px: 2, py: 2, pb: 6 }}>
      <Stack spacing={2}>
        {instalado()
          ? <Alert severity="success">Você está usando o app instalado. As atualizações chegam sozinhas.</Alert>
          : <Alert severity="info">Instale no celular para abrir como um app, pelo ícone, e usar mesmo sem internet. Veja como no fim desta página.</Alert>}

        <Secao icone={<LogoutRoundedIcon color="primary" />} titulo="Saída">
          <Typography sx={{ mb: 1 }}>Ao sair com um veículo (para uma obra ou outro serviço).</Typography>
          <Passos itens={[
            <>Escolha o <strong>Veículo</strong>.</>,
            <>Confira o <strong>KM</strong> do painel. Ele já vem com o último registrado; digite só os números inteiros, sem a casa decimal (o <strong>?</strong> mostra um exemplo).</>,
            <>Escolha a <strong>Obra</strong>: busque pelo nome, pelo sinônimo ou pela cidade.</>,
            <>Escolha ou escreva o <strong>Motivo</strong> e toque em <strong>Salvar Saída</strong>.</>,
          ]} />
          <Button sx={{ mt: 1 }} variant="contained" onClick={() => navigate('/motorista/saida')}>Abrir Saída</Button>
        </Secao>

        <Secao icone={<LoginRoundedIcon color="primary" />} titulo="Chegada">
          <Typography sx={{ mb: 1 }}>Ao voltar com o veículo para a Fábrica.</Typography>
          <Passos itens={[
            <>Escolha o <strong>Veículo</strong>.</>,
            <>Digite o <strong>KM</strong> do painel (tem que ser maior que o último).</>,
            <>A obra é sempre a <strong>Fábrica</strong>: é só tocar em <strong>Salvar Chegada</strong>.</>,
          ]} />
          <Button sx={{ mt: 1 }} variant="contained" onClick={() => navigate('/motorista/chegada')}>Abrir Chegada</Button>
        </Secao>

        <Secao icone={<HistoryRoundedIcon color="primary" />} titulo="Meu histórico">
          <Typography sx={{ mb: 1 }}>Suas saídas e chegadas, da mais nova para a mais antiga.</Typography>
          <Stack spacing={1} sx={{ mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" color="success" variant="outlined" label="Enviado" /><Typography variant="body2">já está no sistema.</Typography></Stack>
            <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" color="warning" label="Aguardando envio" /><Typography variant="body2">está guardado no celular, esperando internet.</Typography></Stack>
          </Stack>
          <Button variant="outlined" onClick={() => navigate('/motorista/historico')}>Abrir Meu histórico</Button>
        </Secao>

        <Secao icone={<CloudOffOutlinedIcon color="primary" />} titulo="Sem internet">
          <Passos itens={[
            <>Pode lançar normalmente: a saída ou chegada fica guardada no celular.</>,
            <>Quando a internet voltar, ela é enviada sozinha, <strong>com o app aberto</strong>.</>,
            <>Para enviar na hora, abra o <strong>Meu histórico</strong> e toque em <strong>Tentar novamente</strong>.</>,
            <>Para as listas de veículos e obras aparecerem sem internet, abra as telas com internet pelo menos uma vez antes.</>,
          ]} />
        </Secao>

        <Typography variant="h6" fontWeight={800} sx={{ pt: 1 }}>Instalar no celular</Typography>
        {iphone ? <><InstalarIphone /><InstalarAndroid /></> : <><InstalarAndroid /><InstalarIphone /></>}
        <Alert severity="info">
          <strong>Atualizações:</strong> não precisa reinstalar. Quando houver versão nova, aparece o aviso <strong>Atualizar agora</strong> ao abrir o app; é só tocar nele.
        </Alert>
      </Stack>
    </Box>
  );
}
