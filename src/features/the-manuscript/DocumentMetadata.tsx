import { Chip, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import type { ManuscriptMetadata } from '../../../functions/manuscriptMetadata';

const RELACOES: Array<[keyof ManuscriptMetadata, string]> = [['define', 'Define'], ['le', 'Lê'], ['escreve', 'Escreve'], ['chama', 'Chama'], ['integra', 'Integra']];

/** Bloco de dados do documento (00_METADADOS.md) como cartão; cada entidade abre o mapa focado nela. */
export default function DocumentMetadata({ metadata }: { metadata: ManuscriptMetadata }) {
  const navigate = useNavigate();
  return <section className="manuscript-metadata" aria-label="Bloco de dados do documento">
    <Stack direction="row" spacing={.75} useFlexGap flexWrap="wrap" alignItems="center">
      <Chip size="small" label={metadata.tipo} className="manuscript-metadata-tipo" />
      <Chip size="small" label={metadata.status} className={`manuscript-metadata-status ${metadata.status}`} />
      {metadata.dominios.map((dominio) => <Chip key={dominio} size="small" variant="outlined" label={dominio} />)}
    </Stack>
    <Typography variant="body2" className="manuscript-metadata-resumo">{metadata.resumo}</Typography>
    {RELACOES.map(([key, label]) => {
      const values = metadata[key] as string[];
      return values.length ? <div key={key} className="manuscript-metadata-row"><Typography variant="caption">{label}</Typography><Stack direction="row" spacing={.5} useFlexGap flexWrap="wrap">{values.map((entity) => <Chip key={entity} size="small" variant="outlined" label={entity} onClick={() => navigate(`/the-manuscript/mapa?foco=${encodeURIComponent(entity)}`)} />)}</Stack></div> : null;
    })}
  </section>;
}
