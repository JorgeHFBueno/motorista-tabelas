import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { LIMITES_ARQUIVO, type ArquivoPortal, type ContratoPortal } from './portalDominio';
import { abrirArquivo, urlDoArquivo, usePessoaAtual } from './portalArquivos';
import { enviarFoto, listarFotos, moverParaLixeira, restaurarDaLixeira, type FotoContrato } from './arquivosContratoDados';
import { ETAPAS_FOTO, ehImagem, filtrarLixeira, formatarDataHora, lerTexto, mensagemDeErro, rotuloEtapa } from './contratoConteudoDominio';
import { AvisoSnackbar, CabecalhoAba, SeletorArquivo, Vazio, type Aviso } from './contratoAbasComum';

// Photos of the work shown to the client (portal-fotos), by stage. adm2 sends, moves to the trash and restores.

export default function ContratoFotosTab({ contrato }: { contrato: ContratoPortal }) {
  const pessoa = usePessoaAtual();
  const [fotos, setFotos] = useState<FotoContrato[] | null>(null);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);
  const [lixeira, setLixeira] = useState(false);
  const [etapa, setEtapa] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    let ativo = true;
    listarFotos(contrato.id)
      .then((itens) => { if (ativo) { setFotos(itens); setErro(false); } })
      .catch((err) => {
        console.error('Erro ao carregar as fotos do contrato', err);
        if (ativo) setErro(true);
      });
    return () => { ativo = false; };
  }, [contrato.id, versao]);

  const visiveis = useMemo(
    () => filtrarLixeira(fotos ?? [], lixeira).filter((item) => !etapa || item.etapa === etapa),
    [etapa, fotos, lixeira],
  );
  const quantidadeLixeira = fotos ? filtrarLixeira(fotos, true).length : 0;

  async function abrir(foto: FotoContrato) {
    if (!(await abrirArquivo(foto.arquivo))) setAviso({ severity: 'error', message: 'Não foi possível abrir a foto.' });
  }

  async function alternarLixeira(foto: FotoContrato) {
    if (!pessoa) return;
    setOcupado(foto.id);
    try {
      if (foto.excluidoEm) await restaurarDaLixeira('fotos', foto.id);
      else await moverParaLixeira('fotos', foto.id, pessoa);
      setAviso({ severity: 'success', message: foto.excluidoEm ? 'Foto restaurada.' : 'Foto movida para a lixeira.' });
      setVersao((v) => v + 1);
    } catch (err) {
      console.error('Erro ao mover a foto', err);
      setAviso({ severity: 'error', message: 'Não foi possível alterar a foto. Tente novamente.' });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <CabecalhoAba titulo="Fotos" lixeira={lixeira} quantidadeLixeira={quantidadeLixeira} onAlternarLixeira={() => setLixeira((v) => !v)}>
        <TextField select size="small" label="Etapa" value={etapa} onChange={(event) => setEtapa(event.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Todas</MenuItem>
          {ETAPAS_FOTO.map((item) => <MenuItem key={item.id} value={item.id}>{item.rotulo}</MenuItem>)}
        </TextField>
        {!lixeira && (
          <Button variant="contained" startIcon={<AddPhotoAlternateIcon />} onClick={() => setDialogo(true)} disabled={!pessoa}>Enviar foto</Button>
        )}
      </CabecalhoAba>

      {erro ? (
        <Alert severity="error">Não foi possível carregar as fotos.</Alert>
      ) : !fotos ? (
        <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
      ) : !visiveis.length ? (
        <Vazio>{lixeira ? 'Nenhuma foto na lixeira.' : etapa ? 'Nenhuma foto nesta etapa.' : 'Nenhuma foto enviada.'}</Vazio>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
          {visiveis.map((foto) => (
            <Paper key={foto.id} variant="outlined" sx={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <Miniatura arquivo={foto.arquivo} onClick={() => abrir(foto)} />
              <Box sx={{ p: 1.25, flexGrow: 1 }}>
                <Chip label={rotuloEtapa(foto.etapa)} size="small" variant="outlined" />
                {foto.observacao && <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{foto.observacao}</Typography>}
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {lixeira
                    ? `Na lixeira desde ${formatarDataHora(foto.excluidoEm)}${foto.excluidoPor?.nome ? ` · ${foto.excluidoPor.nome}` : ''}`
                    : `${formatarDataHora(foto.criadoEm)}${foto.criadoPor?.nome ? ` · ${foto.criadoPor.nome}` : ''}`}
                </Typography>
              </Box>
              <Stack direction="row" justifyContent="flex-end" sx={{ px: 0.5, pb: 0.5 }}>
                <Tooltip title="Abrir">
                  <span><IconButton size="small" onClick={() => abrir(foto)} disabled={!foto.arquivo}><OpenInNewIcon fontSize="small" /></IconButton></span>
                </Tooltip>
                <Tooltip title={lixeira ? 'Restaurar' : 'Mover para a lixeira'}>
                  <span>
                    <IconButton size="small" onClick={() => alternarLixeira(foto)} disabled={!pessoa || ocupado === foto.id}>
                      {lixeira ? <RestoreFromTrashIcon fontSize="small" /> : <DeleteOutlineIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Paper>
          ))}
        </Box>
      )}

      {lixeira && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          O cliente não vê as fotos da lixeira. Restaurar volta a foto para o portal.
        </Typography>
      )}

      {dialogo && pessoa && (
        <EnviarFotoDialog
          onClose={() => setDialogo(false)}
          onEnviar={async (dados) => {
            await enviarFoto(contrato, dados, pessoa);
            setDialogo(false);
            setAviso({ severity: 'success', message: 'Foto enviada.' });
            setVersao((v) => v + 1);
          }}
        />
      )}

      <AvisoSnackbar aviso={aviso} onClose={() => setAviso(null)} />
    </Paper>
  );
}

/** Thumbnail: the download link is asked at display time (never stored). */
function Miniatura({ arquivo, onClick }: { arquivo: ArquivoPortal | null; onClick: () => void }) {
  const path = arquivo?.path ?? null;
  const [url, setUrl] = useState<{ path: string | null; url: string | null } | null>(null);

  useEffect(() => {
    let ativo = true;
    urlDoArquivo(path ? { path } : null).then((link) => { if (ativo) setUrl({ path, url: link }); });
    return () => { ativo = false; };
  }, [path]);

  const carregando = !url || url.path !== path;
  return (
    <Box
      onClick={url?.url ? onClick : undefined}
      sx={{ aspectRatio: '4 / 3', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: url?.url ? 'pointer' : 'default' }}
    >
      {carregando ? (
        <CircularProgress size={20} />
      ) : url.url ? (
        <Box component="img" src={url.url} alt={arquivo?.nome ?? 'Foto'} loading="lazy" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <BrokenImageOutlinedIcon color="disabled" />
      )}
    </Box>
  );
}

function EnviarFotoDialog({
  onClose,
  onEnviar,
}: {
  onClose: () => void;
  onEnviar: (dados: { etapa: string; observacao: string | null; arquivo: File }) => Promise<void>;
}) {
  const [etapa, setEtapa] = useState('');
  const [observacao, setObservacao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const naoImagem = Boolean(arquivo && !ehImagem(arquivo.type));
  const pronto = Boolean(etapa && arquivo && !naoImagem && arquivo.size <= LIMITES_ARQUIVO.foto);

  async function enviar() {
    if (!pronto || !arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      await onEnviar({ etapa, observacao: lerTexto(observacao), arquivo });
    } catch (err) {
      console.error('Erro ao enviar a foto', err);
      setErro(mensagemDeErro(err, 'Não foi possível enviar a foto. Tente novamente.'));
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={enviando ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Enviar foto</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Etapa" value={etapa} onChange={(event) => setEtapa(event.target.value)} required disabled={enviando}>
            {ETAPAS_FOTO.map((item) => <MenuItem key={item.id} value={item.id}>{item.rotulo}</MenuItem>)}
          </TextField>
          <TextField label="Observação" value={observacao} onChange={(event) => setObservacao(event.target.value)} multiline minRows={2} disabled={enviando} />
          <SeletorArquivo arquivo={arquivo} onChange={setArquivo} accept="image/*" limiteBytes={LIMITES_ARQUIVO.foto} rotulo="Escolher imagem" disabled={enviando} />
          {naoImagem && <Alert severity="warning">Escolha uma imagem (JPG, PNG...).</Alert>}
          {erro && <Alert severity="error">{erro}</Alert>}
          <Typography variant="caption" color="text.secondary">A foto aparece para o cliente no portal assim que é enviada.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} disabled={!pronto || enviando}>{enviando ? 'Enviando...' : 'Enviar'}</Button>
      </DialogActions>
    </Dialog>
  );
}
