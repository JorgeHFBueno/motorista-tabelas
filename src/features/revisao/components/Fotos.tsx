import { Box, CircularProgress, Dialog, IconButton, Tooltip } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import { useEffect, useState, type ReactNode } from 'react';
import { urlDaFoto } from '../../../services/checklists.service';
import type { ChecklistFoto } from '../../checklist-mecanico/domain/rascunho';
import { lerArquivo } from '../data/armazenamentoLocal';
import { fotoRemota } from '../domain/documento';

const TAMANHO = 72;

/** URL temporária de uma foto guardada no aparelho (liberada ao sair). */
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
      .catch((error) => console.warn('Revisão: foto não encontrada no aparelho', error));
    return () => {
      ativa = false;
      if (criada) URL.revokeObjectURL(criada);
      setUrl(null);
    };
  }, [chave]);
  return url;
}

function Ampliada({ url, onFechar }: { url: string | null; onFechar: () => void }) {
  return (
    <Dialog open onClose={onFechar} fullWidth maxWidth="lg">
      <Box sx={{ position: 'relative', bgcolor: '#000', minHeight: 200, display: 'grid', placeItems: 'center' }}>
        {url ? <img src={url} alt="Foto do item" style={{ width: '100%', display: 'block' }} /> : <CircularProgress sx={{ color: '#fff' }} />}
        <IconButton aria-label="Fechar" onClick={onFechar} sx={{ position: 'absolute', top: 8, right: 8, color: '#fff', bgcolor: 'rgb(0 0 0 / 0.5)' }}>
          <CloseRoundedIcon />
        </IconButton>
      </Box>
    </Dialog>
  );
}

function Quadro({ children, onClick, rotulo }: { children: ReactNode; onClick?: () => void; rotulo: string }) {
  return (
    <Box
      component={onClick ? 'button' : 'div'}
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      aria-label={rotulo}
      sx={{
        p: 0, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden', width: TAMANHO, height: TAMANHO,
        bgcolor: 'grey.200', cursor: onClick ? 'zoom-in' : 'default', display: 'grid', placeItems: 'center',
      }}
    >
      {children}
    </Box>
  );
}

function FotoDoAparelho({ foto }: { foto: ChecklistFoto }) {
  const miniatura = useArquivoUrl(foto.miniatura);
  const [aberta, setAberta] = useState(false);
  const original = useArquivoUrl(aberta ? foto.arquivo : null);
  return (
    <>
      <Quadro rotulo="Ampliar foto" onClick={() => setAberta(true)}>
        {miniatura && <img src={miniatura} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </Quadro>
      {aberta && <Ampliada url={original} onFechar={() => setAberta(false)} />}
    </>
  );
}

/** Foto já no Storage: miniatura de lá; toque para ampliar. */
export function FotoDoServidor({ foto }: { foto: ChecklistFoto }) {
  const [miniatura, setMiniatura] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const [aberta, setAberta] = useState<string | null | false>(false);
  useEffect(() => {
    let ativa = true;
    urlDaFoto(foto.miniatura).then((u) => ativa && setMiniatura(u)).catch(() => ativa && setErro(true));
    return () => { ativa = false; };
  }, [foto.miniatura]);
  const abrir = () => {
    setAberta(null);
    urlDaFoto(foto.arquivo).then((u) => setAberta((atual) => (atual === false ? false : u))).catch(() => setAberta(false));
  };
  if (erro) {
    return (
      <Tooltip title="Foto já enviada">
        <span><Quadro rotulo="Foto já enviada"><CloudDoneOutlinedIcon color="action" /></Quadro></span>
      </Tooltip>
    );
  }
  return (
    <>
      <Quadro rotulo="Ampliar foto" onClick={abrir}>
        {miniatura ? <img src={miniatura} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <CircularProgress size={20} />}
      </Quadro>
      {aberta !== false && <Ampliada url={aberta} onFechar={() => setAberta(false)} />}
    </>
  );
}

/** Miniatura de uma foto do item (do aparelho ou já enviada), com X para remover quando editável. */
export function FotoItem({ foto, onRemover }: { foto: ChecklistFoto; onRemover?: () => void }) {
  return (
    <Box sx={{ position: 'relative', width: TAMANHO, height: TAMANHO, flex: '0 0 auto' }}>
      {fotoRemota(foto) ? <FotoDoServidor foto={foto} /> : <FotoDoAparelho foto={foto} />}
      {onRemover && (
        <IconButton
          aria-label="Remover foto"
          size="small"
          onClick={onRemover}
          sx={{ position: 'absolute', top: -10, right: -10, bgcolor: 'background.paper', border: 1, borderColor: 'divider', '&:hover': { bgcolor: 'background.paper' } }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
