import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import type { ObraDetalhe } from '../obras/obrasDomain';
import { localPendente } from '../obras/obrasDomain';
import { documentoDoFriday, publicarContrato, type DocumentoDoFriday } from './contratosPortalData';
import { usePessoaAtual } from './portalArquivos';
import { formatarDataIso, formatarDocumento, normalizarDocumento } from './portalDominio';

// "Publicar no portal": creates portal-obras/{id} from obras-v2, with the CNPJ/CPF of the Friday column
// "CNPJ/CPF Cliente" (The Manuscript, portal.md, "Vínculo do cliente").

const AVISO_FRIDAY: Record<Exclude<DocumentoDoFriday['situacao'], 'ok'>, string> = {
  sem_item: 'O contrato não tem item ligado no Friday. Digite o CNPJ/CPF do cliente.',
  sem_coluna: 'O quadro do Friday deste contrato não tem a coluna "CNPJ/CPF Cliente". Digite o CNPJ/CPF do cliente.',
  vazio: 'A coluna "CNPJ/CPF Cliente" está vazia no Friday. Digite o CNPJ/CPF do cliente.',
  invalido: 'O CNPJ/CPF do Friday não é válido. Confira e digite o correto.',
};

type Props = { obra: ObraDetalhe | null; onClose: () => void; onPublicado: (obraId: string) => void };

export default function PublicarContratoDialog({ obra, onClose, onPublicado }: Props) {
  const pessoa = usePessoaAtual();
  const [friday, setFriday] = useState<DocumentoDoFriday | 'carregando' | 'erro'>('carregando');
  const [documento, setDocumento] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!obra) return;
    let ativo = true;
    setFriday('carregando');
    setDocumento('');
    setErro(null);
    documentoDoFriday(obra.id)
      .then((resultado) => {
        if (!ativo) return;
        setFriday(resultado);
        if (resultado.situacao === 'ok') setDocumento(formatarDocumento(resultado.documento));
        if (resultado.situacao === 'invalido') setDocumento(resultado.valor);
      })
      .catch((err) => {
        console.error('Erro ao ler o CNPJ/CPF do Friday', err);
        if (ativo) setFriday('erro');
      });
    return () => { ativo = false; };
  }, [obra]);

  const normalizado = normalizarDocumento(documento);

  const publicar = async () => {
    if (!obra || !pessoa || !normalizado) return;
    setSalvando(true);
    setErro(null);
    try {
      await publicarContrato(obra, normalizado, pessoa);
      onPublicado(obra.id);
    } catch (err) {
      console.error('Erro ao publicar o contrato no portal', err);
      setErro(err instanceof Error && err.message ? err.message : 'Não foi possível publicar o contrato.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={!!obra} onClose={salvando ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Publicar no portal</DialogTitle>
      <DialogContent>
        {obra && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{obra.nomeObra}</Typography>
              <Typography variant="body2" color="text.secondary">
                {[obra.numeroContrato && `Contrato ${obra.numeroContrato}`, !localPendente(obra.local) && obra.local].filter(Boolean).join(' · ') || '—'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Previsão: {formatarDataIso(obra.dataInicial)} a {formatarDataIso(obra.dataFinal)}
              </Typography>
            </Box>
            {friday === 'carregando' ? (
              <Box display="flex" alignItems="center" gap={1}><CircularProgress size={18} /><Typography variant="body2">Lendo o CNPJ/CPF no Friday…</Typography></Box>
            ) : friday === 'erro' ? (
              <Alert severity="warning">Não foi possível ler o Friday. Digite o CNPJ/CPF do cliente.</Alert>
            ) : friday.situacao === 'ok' ? (
              <Alert severity="info">CNPJ/CPF lido da coluna "CNPJ/CPF Cliente" do Friday.</Alert>
            ) : (
              <Alert severity="warning">{AVISO_FRIDAY[friday.situacao]}</Alert>
            )}
            <TextField
              label="CNPJ/CPF do cliente"
              value={documento}
              onChange={(event) => setDocumento(event.target.value)}
              onBlur={() => { if (normalizado) setDocumento(formatarDocumento(normalizado)); }}
              error={!!documento && !normalizado}
              helperText={documento && !normalizado ? 'CNPJ (14 dígitos) ou CPF (11 dígitos) com dígitos verificadores válidos.' : 'Os clientes com este CNPJ/CPF passam a ver o contrato.'}
              disabled={salvando || friday === 'carregando'}
              fullWidth
            />
            <Typography variant="body2" color="text.secondary">
              O portal recebe uma cópia do nome, do local, do número do contrato e da previsão, e o modelo padrão de progresso.
              Depois de publicado, o contrato não pode ser retirado do portal.
            </Typography>
            {erro && <Alert severity="error">{erro}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button variant="contained" onClick={() => void publicar()} disabled={salvando || !normalizado || !pessoa}>
          {salvando ? 'Publicando…' : 'Publicar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
