import { Button, Card, CardContent, CircularProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import NotesRoundedIcon from '@mui/icons-material/NotesRounded';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import { memo, useRef, useState, type ChangeEvent } from 'react';
import { observacaoObrigatoria, type ChecklistItemDef } from '../domain/catalogo';
import type { ChecklistFoto, ChecklistResposta, ChecklistStatus, OrigemFoto } from '../domain/rascunho';
import FotoMiniatura from './FotoMiniatura';

const STATUS: { valor: ChecklistStatus; rotulo: string; cor: 'success' | 'error' | 'standard' }[] = [
  { valor: 'ok', rotulo: 'OK', cor: 'success' },
  { valor: 'avaria', rotulo: 'Avaria', cor: 'error' },
  { valor: 'nao_se_aplica', rotulo: 'Não se aplica', cor: 'standard' },
];

/** Um item: OK / Avaria / Não se aplica, observação e fotos, com a pendência destacada depois de tentar concluir. */
function ItemCard({ item, resposta, destacarPendencia, processandoFoto, onStatus, onObservacao, onAdicionarFoto, onRemoverFoto }: {
  item: ChecklistItemDef;
  resposta: ChecklistResposta;
  destacarPendencia: boolean;
  processandoFoto: boolean;
  onStatus: (itemId: string, status: ChecklistStatus) => void;
  onObservacao: (itemId: string, texto: string) => void;
  onAdicionarFoto: (itemId: string, arquivo: File, origem: OrigemFoto) => void;
  onRemoverFoto: (itemId: string, foto: ChecklistFoto) => void;
}) {
  const [mostrarObservacao, setMostrarObservacao] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const escolheu = (origem: OrigemFoto) => (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = ''; // a mesma foto pode ser escolhida de novo
    if (arquivo) onAdicionarFoto(item.id, arquivo, origem);
  };
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
            {resposta.fotos.length > 0 && (
              <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', pt: 1.25, pr: 1.5 }}>
                {resposta.fotos.map((foto) => <FotoMiniatura key={foto.arquivo} foto={foto} onRemover={() => onRemoverFoto(item.id, foto)} />)}
              </Stack>
            )}
            {/* Câmera: abre direto a câmera traseira no celular; Galeria: escolhe uma foto já tirada. */}
            <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={escolheu('camera')} />
            <input ref={galeria} type="file" accept="image/*" hidden onChange={escolheu('galeria')} />
            <Stack direction="row" spacing={1} alignItems="center">
              <Button variant="outlined" startIcon={<PhotoCameraOutlinedIcon />} disabled={processandoFoto} onClick={() => camera.current?.click()} sx={{ minHeight: 44 }}>Câmera</Button>
              <Button variant="outlined" startIcon={<PhotoLibraryOutlinedIcon />} disabled={processandoFoto} onClick={() => galeria.current?.click()} sx={{ minHeight: 44 }}>Galeria</Button>
              {processandoFoto && <CircularProgress size={22} aria-label="Preparando a foto" />}
            </Stack>
            {faltaFoto && <Typography variant="body2" color="error">Inclua ao menos uma foto da avaria.</Typography>}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(ItemCard);
