import { Box, FormLabel, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { AREAS, AREAS_NIVEL_UNICO, type Area, type Areas, type Nivel } from '../services/areasWeb';

type Escolha = 'nenhum' | Nivel;

// Áreas da WEB de uma pessoa (decisão de 2026-11-16): sem acesso, ver ou editar; o Friday tem um nível só. Só o adm2
// muda (a adminApi confere); para os outros, a grade aparece só para consulta.
export default function AreasWebEditor({ areas, onChange, somenteLeitura }: {
  areas: Areas;
  onChange: (areas: Areas) => void;
  somenteLeitura: boolean;
}) {
  const mudar = (area: Area, escolha: Escolha | null) => {
    if (!escolha) return;
    const proximas = { ...areas };
    if (escolha === 'nenhum') delete proximas[area];
    else proximas[area] = escolha;
    onChange(proximas);
  };

  return (
    <div>
      <FormLabel component="legend">Áreas da WEB</FormLabel>
      {somenteLeitura && <Typography variant="caption" color="text.secondary" component="div">Só o adm2 muda as áreas.</Typography>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, alignItems: 'center', columnGap: 2, rowGap: 1, mt: 1 }}>
        {AREAS.map((a) => {
          const unico = AREAS_NIVEL_UNICO.includes(a.chave);
          return (
            <Box key={a.chave} sx={{ display: 'contents' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600}>{a.rotulo}</Typography>
                <Typography variant="caption" color="text.secondary" component="div">
                  {unico ? a.editar : `Ver: ${a.ver}. Editar: ${a.editar}.`}
                </Typography>
              </Box>
              <ToggleButtonGroup
                size="small"
                exclusive
                disabled={somenteLeitura}
                value={areas[a.chave] ?? 'nenhum'}
                onChange={(_e, v: Escolha | null) => mudar(a.chave, v)}
                aria-label={`Acesso a ${a.rotulo}`}
              >
                <ToggleButton value="nenhum">Sem acesso</ToggleButton>
                {!unico && <ToggleButton value="ver">Ver</ToggleButton>}
                <ToggleButton value="editar">{unico ? 'Acesso' : 'Editar'}</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          );
        })}
      </Box>
    </div>
  );
}
