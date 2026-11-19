import { Chip } from '@mui/material';
import { estaAberta, tituloStatus, type RevisaoRegistro } from '../domain/registro';

/** "Em manutenção" ou "Fechada". */
export default function ChipStatus({ registro }: { registro: RevisaoRegistro }) {
  const aberta = estaAberta(registro);
  return <Chip size="small" color={aberta ? 'warning' : 'default'} variant={aberta ? 'outlined' : 'filled'} label={tituloStatus(registro)} />;
}
