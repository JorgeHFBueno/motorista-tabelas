import { Box, Dialog, IconButton } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useEffect, useState } from 'react';
import { lerArquivo } from '../data/armazenamentoLocal';
import type { ChecklistFoto } from '../domain/rascunho';

/** URL temporária de um arquivo guardado no aparelho (liberada ao sair). */
function useArquivoUrl(chave: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!chave) return undefined;
    let ativa = true;
    let criada: string | null = null;
    lerArquivo(chave)
      .then((blob) => {
        if (!ativa || !blob) return;
        criada = URL.createObjectURL(blob);
        setUrl(criada);
      })
      .catch((error) => console.warn('Checklist: foto não encontrada no aparelho', error));
    return () => {
      ativa = false;
      if (criada) URL.revokeObjectURL(criada);
      setUrl(null);
    };
  }, [chave]);
  return url;
}

/** Miniatura de uma foto do item: toque para ampliar, X para remover. */
export default function FotoMiniatura({ foto, onRemover }: { foto: ChecklistFoto; onRemover: () => void }) {
  const miniatura = useArquivoUrl(foto.miniatura);
  const [aberta, setAberta] = useState(false);
  const original = useArquivoUrl(aberta ? foto.arquivo : null);
  return (
    <Box sx={{ position: 'relative', width: 72, height: 72, flex: '0 0 auto' }}>
      <Box
        component="button"
        type="button"
        onClick={() => setAberta(true)}
        aria-label="Ampliar foto"
        sx={{ p: 0, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', width: 72, height: 72, bgcolor: 'grey.200', cursor: 'pointer' }}
      >
        {miniatura && <img src={miniatura} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </Box>
      <IconButton
        aria-label="Remover foto"
        size="small"
        onClick={onRemover}
        sx={{ position: 'absolute', top: -10, right: -10, bgcolor: 'background.paper', border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'background.paper' } }}
      >
        <CloseRoundedIcon fontSize="small" />
      </IconButton>
      <Dialog open={aberta} onClose={() => setAberta(false)} fullWidth maxWidth="lg">
        <Box sx={{ position: 'relative', bgcolor: '#000', minHeight: 200 }}>
          {original && <img src={original} alt="Foto do item" style={{ width: '100%', display: 'block' }} />}
          <IconButton aria-label="Fechar" onClick={() => setAberta(false)} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', bgcolor: 'rgb(0 0 0 / 0.5)' }}>
            <CloseRoundedIcon />
          </IconButton>
        </Box>
      </Dialog>
    </Box>
  );
}
