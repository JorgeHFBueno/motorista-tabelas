import { useState } from 'react';
import { Alert, Button, Paper, Stack, Typography } from '@mui/material';
import { migrarAreas, type EtapaMigracaoAreas, type ResultadoMigracaoAreas } from '../services/adminUsersApi';

const ETAPAS: { etapa: EtapaMigracaoAreas; titulo: string; texto: string }[] = [
  { etapa: 'areas', titulo: '1. Gravar áreas', texto: 'Cada pessoa sem o mapa de áreas recebe as áreas que as credenciais antigas davam, todas em "editar". Ninguém ganha nem perde acesso.' },
  { etapa: 'limpar', titulo: '2. Limpar credenciais antigas', texto: 'Tira Escritório, Engenharia, Logística e Autor dos perfis. Só depois da etapa 1 e da publicação das Rules e Functions novas.' },
];

// Migração das áreas da WEB (2026-11-16), só para o adm2: Simular conta o que muda; Executar grava. Sai da tela depois de
// usada, como a migração das credenciais de 2026-10-26.
export default function MigracaoAreas({ onExecutou }: { onExecutou: () => void }) {
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoMigracaoAreas | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const rodar = async (etapa: EtapaMigracaoAreas, executar: boolean) => {
    if (executar && !window.confirm('Gravar a migração no Firestore de produção?')) return;
    setRodando(true);
    setErro(null);
    try {
      const r = await migrarAreas(etapa, executar);
      setResultado(r);
      if (executar) onExecutou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro na migração das áreas.');
    } finally {
      setRodando(false);
    }
  };

  return (
    <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6">Migração das áreas da WEB</Typography>
        {ETAPAS.map((e) => (
          <Stack key={e.etapa} direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography fontWeight={600}>{e.titulo}</Typography>
              <Typography variant="body2" color="text.secondary">{e.texto}</Typography>
            </Stack>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button variant="outlined" disabled={rodando} onClick={() => void rodar(e.etapa, false)}>Simular</Button>
              <Button variant="contained" disabled={rodando} onClick={() => void rodar(e.etapa, true)}>Executar</Button>
            </Stack>
          </Stack>
        ))}
        {erro && <Alert severity="error">{erro}</Alert>}
        {resultado && (
          <Alert severity={resultado.executado ? 'success' : 'info'}>
            {resultado.executado ? 'Gravado' : 'Simulação'} ({resultado.etapa === 'areas' ? 'gravar áreas' : 'limpar credenciais antigas'}): {resultado.alterados} de {resultado.funcionarios} pessoas {resultado.executado ? 'alteradas' : 'mudariam'}.
          </Alert>
        )}
      </Stack>
    </Paper>
  );
}
