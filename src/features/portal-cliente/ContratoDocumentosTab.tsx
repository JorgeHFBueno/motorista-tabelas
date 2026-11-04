import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { LIMITES_ARQUIVO, type ContratoPortal } from './portalDominio';
import { abrirArquivo, usePessoaAtual } from './portalArquivos';
import { enviarDocumento, listarDocumentos, moverParaLixeira, restaurarDaLixeira, type DocumentoContrato } from './arquivosContratoDados';
import { CATEGORIAS_DOCUMENTO, filtrarLixeira, formatarBytes, formatarDataHora, mensagemDeErro, rotuloCategoria } from './contratoConteudoDominio';
import { AvisoSnackbar, CabecalhoAba, SeletorArquivo, Vazio, type Aviso } from './contratoAbasComum';

// Documents of the contract shown to the client (portal-documentos). adm2 sends, moves to the trash and restores.

export default function ContratoDocumentosTab({ contrato }: { contrato: ContratoPortal }) {
  const pessoa = usePessoaAtual();
  const [documentos, setDocumentos] = useState<DocumentoContrato[] | null>(null);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);
  const [lixeira, setLixeira] = useState(false);
  const [categoria, setCategoria] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    let ativo = true;
    listarDocumentos(contrato.id)
      .then((itens) => { if (ativo) { setDocumentos(itens); setErro(false); } })
      .catch((err) => {
        console.error('Erro ao carregar os documentos do contrato', err);
        if (ativo) setErro(true);
      });
    return () => { ativo = false; };
  }, [contrato.id, versao]);

  const visiveis = useMemo(
    () => filtrarLixeira(documentos ?? [], lixeira).filter((item) => !categoria || item.categoria === categoria),
    [categoria, documentos, lixeira],
  );
  const quantidadeLixeira = documentos ? filtrarLixeira(documentos, true).length : 0;

  async function abrir(documento: DocumentoContrato) {
    if (!(await abrirArquivo(documento.arquivo))) setAviso({ severity: 'error', message: 'Não foi possível abrir o arquivo.' });
  }

  async function alternarLixeira(documento: DocumentoContrato) {
    if (!pessoa) return;
    setOcupado(documento.id);
    try {
      if (documento.excluidoEm) await restaurarDaLixeira('documentos', documento.id);
      else await moverParaLixeira('documentos', documento.id, pessoa);
      setAviso({ severity: 'success', message: documento.excluidoEm ? 'Documento restaurado.' : 'Documento movido para a lixeira.' });
      setVersao((v) => v + 1);
    } catch (err) {
      console.error('Erro ao mover o documento', err);
      setAviso({ severity: 'error', message: 'Não foi possível alterar o documento. Tente novamente.' });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <CabecalhoAba titulo="Documentos" lixeira={lixeira} quantidadeLixeira={quantidadeLixeira} onAlternarLixeira={() => setLixeira((v) => !v)}>
        <TextField select size="small" label="Categoria" value={categoria} onChange={(event) => setCategoria(event.target.value)} sx={{ minWidth: 180 }}>
          <MenuItem value="">Todas</MenuItem>
          {CATEGORIAS_DOCUMENTO.map((item) => <MenuItem key={item.id} value={item.id}>{item.rotulo}</MenuItem>)}
        </TextField>
        {!lixeira && (
          <Button variant="contained" startIcon={<UploadFileIcon />} onClick={() => setDialogo(true)} disabled={!pessoa}>Enviar documento</Button>
        )}
      </CabecalhoAba>

      {erro ? (
        <Alert severity="error">Não foi possível carregar os documentos.</Alert>
      ) : !documentos ? (
        <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
      ) : !visiveis.length ? (
        <Vazio>{lixeira ? 'Nenhum documento na lixeira.' : categoria ? 'Nenhum documento nesta categoria.' : 'Nenhum documento enviado.'}</Vazio>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Título</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Categoria</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Arquivo</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{lixeira ? 'Na lixeira desde' : 'Enviado'}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visiveis.map((documento) => (
                <TableRow key={documento.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{documento.titulo}</TableCell>
                  <TableCell>{rotuloCategoria(documento.categoria)}</TableCell>
                  <TableCell sx={{ overflowWrap: 'anywhere' }}>
                    {documento.arquivo ? `${documento.arquivo.nome} · ${formatarBytes(documento.arquivo.bytes)}` : '—'}
                  </TableCell>
                  <TableCell>
                    {lixeira
                      ? `${formatarDataHora(documento.excluidoEm)}${documento.excluidoPor?.nome ? ` · ${documento.excluidoPor.nome}` : ''}`
                      : `${formatarDataHora(documento.criadoEm)}${documento.criadoPor?.nome ? ` · ${documento.criadoPor.nome}` : ''}`}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Abrir">
                      <span><IconButton size="small" onClick={() => abrir(documento)} disabled={!documento.arquivo}><OpenInNewIcon fontSize="small" /></IconButton></span>
                    </Tooltip>
                    <Tooltip title={lixeira ? 'Restaurar' : 'Mover para a lixeira'}>
                      <span>
                        <IconButton size="small" onClick={() => alternarLixeira(documento)} disabled={!pessoa || ocupado === documento.id}>
                          {lixeira ? <RestoreFromTrashIcon fontSize="small" /> : <DeleteOutlineIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {lixeira && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          O cliente não vê os documentos da lixeira. Restaurar volta o documento para o portal.
        </Typography>
      )}

      {dialogo && pessoa && (
        <EnviarDocumentoDialog
          onClose={() => setDialogo(false)}
          onEnviar={async (dados) => {
            await enviarDocumento(contrato, dados, pessoa);
            setDialogo(false);
            setAviso({ severity: 'success', message: 'Documento enviado.' });
            setVersao((v) => v + 1);
          }}
        />
      )}

      <AvisoSnackbar aviso={aviso} onClose={() => setAviso(null)} />
    </Paper>
  );
}

function EnviarDocumentoDialog({
  onClose,
  onEnviar,
}: {
  onClose: () => void;
  onEnviar: (dados: { titulo: string; categoria: string; arquivo: File }) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState('');
  const [categoria, setCategoria] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const pronto = Boolean(titulo.trim() && categoria && arquivo && arquivo.size <= LIMITES_ARQUIVO.documento);

  async function enviar() {
    if (!pronto || !arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      await onEnviar({ titulo: titulo.trim(), categoria, arquivo });
    } catch (err) {
      console.error('Erro ao enviar o documento', err);
      setErro(mensagemDeErro(err, 'Não foi possível enviar o documento. Tente novamente.'));
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={enviando ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Enviar documento</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Título" value={titulo} onChange={(event) => setTitulo(event.target.value)} required disabled={enviando} autoFocus />
          <TextField select label="Categoria" value={categoria} onChange={(event) => setCategoria(event.target.value)} required disabled={enviando}>
            {CATEGORIAS_DOCUMENTO.map((item) => <MenuItem key={item.id} value={item.id}>{item.rotulo}</MenuItem>)}
          </TextField>
          <SeletorArquivo arquivo={arquivo} onChange={setArquivo} limiteBytes={LIMITES_ARQUIVO.documento} disabled={enviando} />
          {erro && <Alert severity="error">{erro}</Alert>}
          <Typography variant="caption" color="text.secondary">O documento aparece para o cliente no portal assim que é enviado.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={enviando}>Cancelar</Button>
        <Button variant="contained" onClick={enviar} disabled={!pronto || enviando}>{enviando ? 'Enviando...' : 'Enviar'}</Button>
      </DialogActions>
    </Dialog>
  );
}
