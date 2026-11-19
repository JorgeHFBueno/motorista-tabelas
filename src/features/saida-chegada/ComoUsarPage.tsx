import { Alert, Box, Button, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import AndroidIcon from '@mui/icons-material/Android';
import AppleIcon from '@mui/icons-material/Apple';
import BuildOutlinedIcon from '@mui/icons-material/BuildOutlined';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import CloudOffOutlinedIcon from '@mui/icons-material/CloudOffOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import IosShareRoundedIcon from '@mui/icons-material/IosShareRounded';
import LoginRoundedIcon from '@mui/icons-material/LoginRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { temCredencial } from '../../services/credenciais';
import PaginaMotorista from './components/PaginaMotorista';

/** iPhone/iPad (o iPad novo se apresenta como Mac com toque). */
const ehIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
/** Aberto pelo ícone da tela inicial, não pelo navegador. */
// Instalar a partir de /motorista: o app Motorista abre só nestas telas (manifest-motorista.webmanifest).
const ENDERECO = `${window.location.host}/motorista`;

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
        <>Abra <strong>{ENDERECO}</strong> no <strong>Chrome</strong> e entre com seu celular e senha.</>,
        <>Toque no menu <MoreVertIcon fontSize="small" sx={{ verticalAlign: 'middle' }} /> (os três pontinhos, no canto de cima).</>,
        <>Toque em <strong>Instalar app</strong> (ou <strong>Adicionar à tela inicial</strong>) e confirme em <strong>Instalar</strong>.</>,
        <>Pronto: o ícone <strong>Motorista</strong> aparece junto dos outros apps. Abra sempre por ele.</>,
      ]} />
    </Secao>
  );
}

function InstalarIphone() {
  return (
    <Secao icone={<AppleIcon />} titulo="Instalar no iPhone">
      <Passos itens={[
        <>Abra <strong>{ENDERECO}</strong> no <strong>Safari</strong> (no iPhone, precisa ser o Safari) e entre com seu celular e senha.</>,
        <>Toque em <strong>Compartilhar</strong> <IosShareRoundedIcon fontSize="small" sx={{ verticalAlign: 'middle' }} /> (o quadrado com a seta, na barra do Safari).</>,
        <>Role a lista e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.</>,
        <>Pronto: abra sempre pelo ícone <strong>Motorista</strong> da Tela de Início.</>,
      ]} />
      <Alert severity="warning" sx={{ mt: 1.5 }}>
        Sem instalar, o iPhone pode apagar o que ficou guardado no aparelho depois de alguns dias sem uso, inclusive lançamentos ainda não enviados.
      </Alert>
    </Secao>
  );
}

function ComoUsarChecklist() {
  return (
    <Secao icone={<ChecklistRoundedIcon color="primary" />} titulo="Checklist">
      <Typography sx={{ mb: 1 }}>A inspeção do veículo ou da máquina, item por item, com fotos e a assinatura do motorista.</Typography>
      <Passos itens={[
        <>Escolha <strong>Veículo</strong> ou <strong>Máquina</strong>, o equipamento, o <strong>KM</strong> ou horímetro, o motorista e se é Saída ou Chegada.</>,
        <>Em cada parte, marque cada item como <strong>OK</strong>, <strong>Avaria</strong> ou <strong>Não se aplica</strong>; nas avarias, escreva o que houve e tire fotos.</>,
        <>Na última parte, toque em <strong>Concluir checklist</strong> e peça a assinatura do motorista (com o celular deitado).</>,
        <>Sem internet, o checklist fica guardado no celular e é enviado sozinho quando ela voltar, <strong>com o app aberto</strong>. Para enviar na hora, toque em <strong>Enviar agora</strong>.</>,
        <>Se sair no meio, o checklist continua de onde parou: toque em <strong>Continuar checklist</strong>.</>,
      ]} />
      <Button sx={{ mt: 1 }} variant="contained" href="/motorista/checklist">Abrir Checklist</Button>
    </Secao>
  );
}

function ComoUsarRevisao() {
  return (
    <Secao icone={<BuildOutlinedIcon color="primary" />} titulo="Revisão">
      <Typography sx={{ mb: 1 }}>O registro de cada ida do veículo ou da máquina ao mecânico: o que foi trocado, consertado ou revisado.</Typography>
      <Passos itens={[
        <>Escolha <strong>Veículo</strong> ou <strong>Máquina</strong> e o equipamento e toque em <strong>Começar revisão</strong>.</>,
        <>Informe o <strong>KM</strong> ou horímetro, <strong>Preventiva</strong> ou <strong>Corretiva</strong>, o motivo e a data que foi ao mecânico.</>,
        <>Em <strong>Adicionar item</strong>, escolha a categoria, a ação e a peça; quantidade, nota e fotos são opcionais.</>,
        <>Toque em <strong>Salvar</strong> para guardar e continuar depois: a revisão fica <strong>Em manutenção</strong>, e qualquer mecânico pode continuá-la.</>,
        <>Quando o equipamento voltar, toque em <strong>Fechar revisão</strong> e informe a data que voltou. Fechada, não muda mais.</>,
        <>Sem internet, fica guardada no celular e é enviada sozinha quando ela voltar, <strong>com o app aberto</strong>.</>,
      ]} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No <strong>Meu histórico</strong> aparecem, resumidos, os checklists e as revisões de todos os mecânicos.</Typography>
      <Button sx={{ mt: 1 }} variant="contained" href="/motorista/revisao">Abrir Revisão</Button>
    </Secao>
  );
}

/** /motorista/como-usar: o que fazer em cada tela (só as que a pessoa tem) e como instalar no celular (Android e iPhone). */
export default function ComoUsarPage() {
  const iphone = ehIphone();
  const { authorizationProfile } = useAuth();
  const motorista = temCredencial(authorizationProfile, 'motorista');
  const mecanico = temCredencial(authorizationProfile, 'mecanico');
  return (
    <PaginaMotorista>
      <Stack spacing={2}>
        {instalado()
          ? <Alert severity="success">Você está usando o app instalado. As atualizações chegam sozinhas.</Alert>
          : <Alert severity="info">Instale no celular para abrir como um app, pelo ícone, e usar mesmo sem internet. Veja como no fim desta página.</Alert>}

        {motorista && <>
        <Secao icone={<LogoutRoundedIcon color="primary" />} titulo="Saída">
          <Typography sx={{ mb: 1 }}>Ao sair com um veículo (para uma obra ou outro serviço).</Typography>
          <Passos itens={[
            <>Escolha o <strong>Veículo</strong>.</>,
            <>Confira o <strong>KM</strong> do painel. Ele já vem com o último registrado; digite só os números inteiros, sem a casa decimal (o <strong>?</strong> mostra um exemplo).</>,
            <>Escolha a <strong>Obra</strong>: busque pelo nome, pelo sinônimo ou pela cidade.</>,
            <>Escolha ou escreva o <strong>Motivo</strong> e toque em <strong>Salvar Saída</strong>.</>,
          ]} />
          <Button sx={{ mt: 1 }} variant="contained" href="/motorista/saida">Abrir Saída</Button>
        </Secao>

        <Secao icone={<LoginRoundedIcon color="primary" />} titulo="Chegada">
          <Typography sx={{ mb: 1 }}>Ao voltar com o veículo para a Fábrica.</Typography>
          <Passos itens={[
            <>Escolha o <strong>Veículo</strong>.</>,
            <>Digite o <strong>KM</strong> do painel (tem que ser maior que o último).</>,
            <>A obra é sempre a <strong>Fábrica</strong>: é só tocar em <strong>Salvar Chegada</strong>.</>,
          ]} />
          <Button sx={{ mt: 1 }} variant="contained" href="/motorista/chegada">Abrir Chegada</Button>
        </Secao>

        <Secao icone={<HistoryRoundedIcon color="primary" />} titulo="Meu histórico">
          <Typography sx={{ mb: 1 }}>Suas saídas e chegadas, da mais nova para a mais antiga.</Typography>
          <Stack spacing={1} sx={{ mb: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" color="success" variant="outlined" label="Enviado" /><Typography variant="body2">já está no sistema.</Typography></Stack>
            <Stack direction="row" spacing={1} alignItems="center"><Chip size="small" color="warning" label="Aguardando envio" /><Typography variant="body2">está guardado no celular, esperando internet.</Typography></Stack>
          </Stack>
          <Button variant="outlined" href="/motorista/historico">Abrir Meu histórico</Button>
        </Secao>

        <Secao icone={<CloudOffOutlinedIcon color="primary" />} titulo="Sem internet">
          <Passos itens={[
            <>Pode lançar normalmente: a saída ou chegada fica guardada no celular.</>,
            <>Quando a internet voltar, ela é enviada sozinha, <strong>com o app aberto</strong>.</>,
            <>Para enviar na hora, abra o <strong>Meu histórico</strong> e toque em <strong>Tentar novamente</strong>.</>,
            <>Para as listas de veículos e obras aparecerem sem internet, abra as telas com internet pelo menos uma vez antes.</>,
          ]} />
        </Secao>
        </>}

        {mecanico && <ComoUsarChecklist />}
        {mecanico && <ComoUsarRevisao />}

        <Typography variant="h6" fontWeight={800} sx={{ pt: 1 }}>Instalar no celular</Typography>
        {iphone ? <><InstalarIphone /><InstalarAndroid /></> : <><InstalarAndroid /><InstalarIphone /></>}
        <Alert severity="info">
          <strong>Atualizações:</strong> não precisa reinstalar. Quando houver versão nova, aparece o aviso <strong>Atualizar agora</strong> ao abrir o app; é só tocar nele.
        </Alert>
      </Stack>
    </PaginaMotorista>
  );
}
