import { Button, Card, CardContent, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import NotesRoundedIcon from '@mui/icons-material/NotesRounded';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import { memo, useState } from 'react';
import { observacaoObrigatoria, type ChecklistItemDef } from '../domain/catalogo';
import type { ChecklistResposta, ChecklistStatus } from '../domain/rascunho';

const STATUS: { valor: ChecklistStatus; rotulo: string; cor: 'success' | 'error' | 'standard' }[] = [
  { valor: 'ok', rotulo: 'OK', cor: 'success' },
  { valor: 'avaria', rotulo: 'Avaria', cor: 'error' },
  { valor: 'nao_se_aplica', rotulo: 'Não se aplica', cor: 'standard' },
];

/** Um item: OK / Avaria / Não se aplica, observação e fotos, com a pendência destacada depois de tentar concluir. */
function ItemCard({ item, resposta, destacarPendencia, onStatus, onObservacao }: {
  item: ChecklistItemDef;
  resposta: ChecklistResposta;
  destacarPendencia: boolean;
  onStatus: (itemId: string, status: ChecklistStatus) => void;
  onObservacao: (itemId: string, texto: string) => void;
}) {
  const [mostrarObservacao, setMostrarObservacao] = useState(false);
  const { status } = resposta;
  const avaria = status === 'avaria';
  const exigeObservacao = avaria || (status === 'ok' && observacaoObrigatoria(item));
  const semStatus = destacarPendencia && status == null;
  const faltaObservacao = destacarPendencia && exigeObservacao && resposta.observacao.trim() === '';
  const faltaFoto = destacarPendencia && avaria && resposta.fotos.length === 0;
  const rotuloObservacao = avaria
    ? (item.campo == null ? 'Descreva a avaria' : `Descreva a avaria e informe: ${item.campo}`)
    : (item.campo == null ? 'Observação (opcional)' : `Observação: ${item.campo}`);

  return (
    <Card variant="outlined" sx={{ borderColor: semStatus || faltaObservacao || faltaFoto ? 'error.main' : undefined, borderWidth: semStatus || faltaObservacao || faltaFoto ? 2 : 1 }}>
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Typography variant="subtitle1" fontWeight={700}>{item.titulo}</Typography>
        {item.campo != null && <Typography variant="body2" color="text.secondary">Informar na observação: {item.campo}</Typography>}
        <ToggleButtonGroup
          exclusive
          fullWidth
          value={status}
          onChange={(_, novo: ChecklistStatus | null) => { if (novo) onStatus(item.id, novo); }}
          sx={{ mt: 1.5 }}
        >
          {STATUS.map((s) => (
            <ToggleButton key={s.valor} value={s.valor} color={s.cor} sx={{ minHeight: 48, fontWeight: 700, textTransform: 'none', fontSize: 15 }}>
              {s.rotulo}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {semStatus && <Typography variant="body2" color="error" sx={{ mt: 0.75 }}>Escolha OK, Avaria ou Não se aplica.</Typography>}
        {status != null && status !== 'nao_se_aplica' && (
          <Stack spacing={1} sx={{ mt: 1.5 }}>
            {exigeObservacao || mostrarObservacao || resposta.observacao !== '' ? (
              <TextField
                label={rotuloObservacao}
                value={resposta.observacao}
                onChange={(e) => onObservacao(item.id, e.target.value)}
                multiline
                minRows={1}
                maxRows={4}
                error={faltaObservacao}
                helperText={faltaObservacao ? (avaria ? 'Obrigatório na avaria' : 'Obrigatório') : undefined}
                slotProps={{ htmlInput: { autoCapitalize: 'sentences' } }}
              />
            ) : (
              <Button startIcon={<NotesRoundedIcon />} onClick={() => setMostrarObservacao(true)} sx={{ alignSelf: 'flex-start' }}>
                Adicionar observação
              </Button>
            )}
            {/* Fotos: câmera e galeria entram com o processamento de imagem (Fase 3). */}
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<PhotoCameraOutlinedIcon />} disabled sx={{ minHeight: 44 }}>Câmera</Button>
              <Button variant="outlined" startIcon={<PhotoLibraryOutlinedIcon />} disabled sx={{ minHeight: 44 }}>Galeria</Button>
            </Stack>
            {faltaFoto && <Typography variant="body2" color="error">Inclua ao menos uma foto da avaria.</Typography>}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(ItemCard);
