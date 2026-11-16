import { Box, Link, Paper, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

// Política de privacidade pública (sem login): o link dela está na tela de autorização do Google (Google Auth Platform
// → Branding), por causa do Google Agenda do Friday (Functions fridayAgenda*).
const secoes: { titulo: string; texto: string[] }[] = [
  {
    titulo: 'Quem usa',
    texto: [
      'O Ledur Motorista é o sistema interno da Ledur. Só entram funcionários com acesso liberado pela administração.',
    ],
  },
  {
    titulo: 'Google Agenda do Friday',
    texto: [
      'Quem quiser pode conectar a própria conta Google em Meu perfil. A conexão é opcional e pede só duas permissões: ver o e-mail principal da conta e criar agendas secundárias, com os eventos dentro delas.',
      'O sistema cria uma agenda chamada “Friday” e coloca nela os itens do Friday com data em que a pessoa é a responsável. Ele só cria, muda e apaga eventos nessa agenda. As outras agendas e compromissos não são lidos nem alterados.',
      'O e-mail serve só para mostrar em Meu perfil qual conta está conectada.',
    ],
  },
  {
    titulo: 'O que fica guardado',
    texto: [
      'A autorização do Google fica cifrada no servidor, com o e-mail da conta e o identificador da agenda “Friday”. Só as funções do servidor leem esses dados; nem a tela do sistema tem acesso a eles.',
      'Os dados recebidos do Google não são vendidos, compartilhados com terceiros nem usados para publicidade.',
      'O uso e a transferência de informações recebidas das APIs do Google seguem a Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado.',
    ],
  },
  {
    titulo: 'Como desconectar',
    texto: [
      'Em Meu perfil → Google Agenda → Desconectar: o sistema apaga a agenda “Friday”, revoga a autorização no Google e apaga os dados guardados.',
      'Também é possível remover o acesso na sua Conta do Google (Segurança → Apps de terceiros). Nesse caso a agenda “Friday” continua na sua conta, e você pode apagá-la no Google Agenda.',
    ],
  },
  {
    titulo: 'Dúvidas',
    texto: ['Fale com a administração do sistema na Ledur.'],
  },
];

export default function PrivacidadePage() {
  return (
    <Box sx={{ display: 'grid', placeItems: 'start center', px: 2, py: 4 }}>
      <Paper elevation={2} sx={{ maxWidth: 720, width: '100%', p: { xs: 2, sm: 4 } }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" component="h1">Política de privacidade</Typography>
            <Typography variant="body2" color="text.secondary">Ledur Motorista · atualizada em 16/11/2026</Typography>
          </Box>
          {secoes.map(s => (
            <Stack key={s.titulo} spacing={1}>
              <Typography variant="h6" component="h2">{s.titulo}</Typography>
              {s.texto.map(t => <Typography key={t} variant="body1">{t}</Typography>)}
            </Stack>
          ))}
          <Link component={RouterLink} to="/login" variant="body2">Ir para o login</Link>
        </Stack>
      </Paper>
    </Box>
  );
}
