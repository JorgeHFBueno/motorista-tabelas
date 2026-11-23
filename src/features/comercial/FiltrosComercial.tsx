import { MenuItem, Stack, TextField } from '@mui/material';
import type { PessoaV2 } from '../../utils/cadastrosV2';
import { SEGMENTOS, TIPOS_NEGOCIO, type FiltroNegocios } from './comercialDominio';

// Filtros de ano, segmento, tipo e responsável, comuns ao Painel e aos Negócios.
export default function FiltrosComercial({ filtro, onChange, anos, pessoas, children }: {
  filtro: FiltroNegocios;
  onChange: (f: FiltroNegocios) => void;
  anos: number[];
  pessoas: PessoaV2[];
  children?: React.ReactNode;
}) {
  const set = <K extends keyof FiltroNegocios>(campo: K, valor: FiltroNegocios[K]) => onChange({ ...filtro, [campo]: valor });
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap alignItems={{ md: 'center' }}>
      <TextField select size="small" label="Ano" value={String(filtro.ano)} sx={{ minWidth: 110 }}
        onChange={(e) => set('ano', e.target.value === 'todos' ? 'todos' : Number(e.target.value))}>
        <MenuItem value="todos">Todos</MenuItem>
        {anos.map((a) => <MenuItem key={a} value={String(a)}>{a}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="Segmento" value={filtro.segmento} sx={{ minWidth: 130 }}
        onChange={(e) => set('segmento', e.target.value as FiltroNegocios['segmento'])}>
        <MenuItem value="todos">Todos</MenuItem>
        {SEGMENTOS.map((s) => <MenuItem key={s.id} value={s.id}>{s.rotulo}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="Tipo" value={filtro.tipo} sx={{ minWidth: 130 }}
        onChange={(e) => set('tipo', e.target.value as FiltroNegocios['tipo'])}>
        <MenuItem value="todos">Todos</MenuItem>
        {TIPOS_NEGOCIO.map((s) => <MenuItem key={s.id} value={s.id}>{s.rotulo}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="Responsável" value={filtro.responsavelUid} sx={{ minWidth: 190 }}
        onChange={(e) => set('responsavelUid', e.target.value)}>
        <MenuItem value="todos">Todos</MenuItem>
        <MenuItem value="">Sem responsável</MenuItem>
        {pessoas.map((p) => <MenuItem key={p.uid} value={p.uid}>{p.nome}</MenuItem>)}
      </TextField>
      {children}
    </Stack>
  );
}
