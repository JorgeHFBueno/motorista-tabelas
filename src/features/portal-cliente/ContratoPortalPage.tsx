import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, Tab, Tabs } from '@mui/material';
import { doc, onSnapshot } from 'firebase/firestore';
import { useParams } from 'react-router-dom';
import { db } from '../../firebase';
import { useTituloPagina } from '../../components/cabecalhoPagina';
import { carregarObra } from '../obras/obrasData';
import type { ObraDetalhe } from '../obras/obrasDomain';
import ContratoDocumentosTab from './ContratoDocumentosTab';
import ContratoFotosTab from './ContratoFotosTab';
import ContratoParcelasTab from './ContratoParcelasTab';
import ContratoResumoTab from './ContratoResumoTab';
import EquipeObraTab from './EquipeObraTab';
import ProgressoObraTab from './ProgressoObraTab';
import PublicarContratoDialog from './PublicarContratoDialog';
import { contratoPortalDe } from './contratosPortalDominio';
import { PORTAL_COLECOES, type ContratoPortal } from './portalDominio';

// A contract in the client portal (adm2): portal-obras/{id}, same id as obras-v2/{id}.
// The Manuscript: 01_FIRESTORE/COLECOES/portal.md and 03_APLICACAO_WEB/16_PORTAL_DO_CLIENTE.md.

type Aba = 'resumo' | 'progresso' | 'equipe' | 'documentos' | 'fotos' | 'parcelas';
const ABAS: Array<{ valor: Aba; rotulo: string }> = [
  { valor: 'resumo', rotulo: 'Resumo' },
  { valor: 'progresso', rotulo: 'Progresso' },
  { valor: 'equipe', rotulo: 'Equipe' },
  { valor: 'documentos', rotulo: 'Documentos' },
  { valor: 'fotos', rotulo: 'Fotos' },
  { valor: 'parcelas', rotulo: 'Parcelas' },
];

type Estado<T> = { status: 'carregando' } | { status: 'erro' } | { status: 'ok'; data: T };

export default function ContratoPortalPage() {
  const { id = '' } = useParams();
  const [obra, setObra] = useState<Estado<ObraDetalhe | null>>({ status: 'carregando' });
  const [contrato, setContrato] = useState<Estado<ContratoPortal | null>>({ status: 'carregando' });
  const [aba, setAba] = useState<Aba>('resumo');
  const [publicando, setPublicando] = useState(false);

  useEffect(() => {
    let ativo = true;
    carregarObra(id)
      .then((data) => { if (ativo) setObra({ status: 'ok', data }); })
      .catch((err) => {
        console.error('Erro ao carregar o contrato de obras-v2', err);
        if (ativo) setObra({ status: 'erro' });
      });
    const parar = onSnapshot(
      doc(db, PORTAL_COLECOES.obras, id),
      (snapshot) => setContrato({ status: 'ok', data: snapshot.exists() ? contratoPortalDe(snapshot.id, snapshot.data()) : null }),
      (err) => {
        console.error('Erro ao carregar o contrato do portal', err);
        setContrato({ status: 'erro' });
      },
    );
    return () => { ativo = false; parar(); };
  }, [id]);

  const publicado = contrato.status === 'ok' ? contrato.data : null;
  const obraV2 = obra.status === 'ok' ? obra.data : null;
  useTituloPagina(publicado?.nome || obraV2?.nomeObra);

  if (obra.status === 'carregando' || contrato.status === 'carregando') {
    return <Container sx={{ py: 3 }}><Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box></Container>;
  }

  if (contrato.status === 'erro' || obra.status === 'erro') {
    return (
      <Container sx={{ py: 3 }}>
        <Alert severity="error">
          Não foi possível carregar o contrato. Tente novamente.
        </Alert>
      </Container>
    );
  }

  if (!publicado) {
    return (
      <Container sx={{ py: 3 }}>
        {obraV2 ? (
          <Alert severity="info">
            Este contrato não está publicado no portal: os clientes não o veem.
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button variant="contained" size="small" onClick={() => setPublicando(true)}>Publicar no portal</Button>
            </Stack>
          </Alert>
        ) : (
          <Alert severity="warning">
            Contrato não encontrado em obras-v2.
          </Alert>
        )}
        <PublicarContratoDialog obra={publicando ? obraV2 : null} onClose={() => setPublicando(false)} onPublicado={() => setPublicando(false)} />
      </Container>
    );
  }

  return (
    <Container sx={{ py: 3 }}>
      <Paper variant="outlined" sx={{ mb: 3 }}>
        <Tabs value={aba} onChange={(_event, valor: Aba) => setAba(valor)} variant="scrollable" scrollButtons="auto" aria-label="Partes do contrato">
          {ABAS.map((item) => <Tab key={item.valor} value={item.valor} label={item.rotulo} />)}
        </Tabs>
      </Paper>
      {aba === 'resumo' && <ContratoResumoTab contrato={publicado} obra={obraV2} />}
      {aba === 'progresso' && <ProgressoObraTab contrato={publicado} />}
      {aba === 'equipe' && <EquipeObraTab contrato={publicado} />}
      {aba === 'documentos' && <ContratoDocumentosTab contrato={publicado} />}
      {aba === 'fotos' && <ContratoFotosTab contrato={publicado} />}
      {aba === 'parcelas' && <ContratoParcelasTab contrato={publicado} />}
    </Container>
  );
}
