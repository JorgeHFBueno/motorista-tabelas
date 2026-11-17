import { useEffect, useRef, useState } from 'react';
import { Autocomplete, Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { filtrarLocais, LIMITES_CAMPOS as LIMITES, ROTULOS_CAMPOS, type CampoEditavelObra } from './obrasDomain';
import { LOCAIS_SUGERIDOS } from './locaisSugeridos';

const AJUDA_SINONIMO = 'Outro nome pelo qual a obra é conhecida; aparece antes do nome. Pode ficar vazio.';

/** Campo gravável do detalhe da obra: o valor com o lápis e, na edição, o formulário com Salvar e Cancelar. */
/** Locais lidos da coordenada dos LOTEs: clicar põe no campo. Carrega ao abrir a edição. */
function SugestoesDoLote({ carregar, onEscolher }: { carregar: () => Promise<string[]>; onEscolher: (local: string) => void }) {
  const [locais, setLocais] = useState<string[] | null>(null);
  // Uma leitura por abertura da edição (o componente nasce ao abrir).
  const primeira = useRef(carregar);
  useEffect(() => {
    let vivo = true;
    primeira.current().then((lidos) => { if (vivo) setLocais(lidos); }, () => { if (vivo) setLocais([]); });
    return () => { vivo = false; };
  }, []);
  if (locais === null) {
    return <Typography variant="caption" color="text.secondary">Lendo a cidade pela coordenada do LOTE…</Typography>;
  }
  if (!locais.length) return null;
  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <Typography variant="caption" color="text.secondary">Pela coordenada do LOTE:</Typography>
      {locais.map((local) => (
        <Chip key={local} size="small" icon={<PlaceOutlinedIcon />} label={local} onClick={() => onEscolher(local)} color="primary" variant="outlined" />
      ))}
    </Stack>
  );
}

export default function CampoEditavel({ campo, valor, vazio, destaque, salvando, onSalvar, somenteLeitura = false, sugestoesDoLote }: {
  campo: CampoEditavelObra;
  valor: string;
  /** Texto e botão quando falta o valor (o local também quando é "CORRIGIR"). */
  vazio: { texto: string; botao: string } | null;
  destaque?: boolean;
  salvando: boolean;
  /** Devolve true quando gravou, para fechar a edição. */
  onSalvar: (valor: string) => Promise<boolean>;
  /** Área Engenharia em "ver": só o valor, sem lápis nem botão. */
  somenteLeitura?: boolean;
  /** Só no local: lê "Cidade - UF" pela coordenada dos LOTEs, para sugerir na edição. */
  sugestoesDoLote?: () => Promise<string[]>;
}) {
  const [editado, setEditado] = useState<string | null>(null); // null = fora da edição
  const rotulo = ROTULOS_CAMPOS[campo];
  const obrigatorio = campo === 'local';

  if (editado === null) {
    return (
      <Box minWidth={0}>
        <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography
            sx={{ fontSize: destaque ? { xs: 18, sm: 22 } : 16, fontWeight: 600, overflowWrap: 'anywhere' }}
            color={vazio ? (obrigatorio ? 'warning.dark' : 'text.secondary') : 'text.primary'}
          >
            {vazio ? vazio.texto : valor}
          </Typography>
          {somenteLeitura ? null : vazio ? (
            <Button size="small" variant={obrigatorio ? 'contained' : 'outlined'} onClick={() => setEditado('')}>{vazio.botao}</Button>
          ) : (
            <Tooltip title={`Editar ${rotulo.toLowerCase()}`}>
              <IconButton size="small" aria-label={`Editar ${rotulo.toLowerCase()}`} onClick={() => setEditado(valor)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
    );
  }

  const cancelarComEsc = (event: React.KeyboardEvent) => { if (event.key === 'Escape') setEditado(null); };
  const salvar = async () => { if (await onSalvar(editado)) setEditado(null); };

  return (
    <Stack spacing={1}>
      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1}
        alignItems={{ sm: 'flex-start' }}
        sx={{ maxWidth: 640 }}
        onSubmit={(event) => { event.preventDefault(); void salvar(); }}
      >
        {campo === 'local' ? (
          <Autocomplete
            freeSolo
            fullWidth
            options={LOCAIS_SUGERIDOS}
            filterOptions={(opcoes, { inputValue }) => filtrarLocais(opcoes, inputValue)}
            inputValue={editado}
            onInputChange={(_event, value) => setEditado(value.slice(0, LIMITES.local))}
            disabled={salvando}
            renderInput={(params) => (
              <TextField {...params} size="small" label={rotulo} placeholder="Digite a cidade ou escolha da lista" onKeyDown={cancelarComEsc} autoFocus />
            )}
          />
        ) : (
          <TextField
            size="small"
            label={rotulo}
            placeholder="Ex.: Ponte do Arroio Grande"
            value={editado}
            onChange={(event) => setEditado(event.target.value)}
            onKeyDown={cancelarComEsc}
            autoFocus
            fullWidth
            disabled={salvando}
            helperText={AJUDA_SINONIMO}
            slotProps={{ htmlInput: { maxLength: LIMITES.siglaObra } }}
          />
        )}
        <Stack direction="row" spacing={1} sx={{ pt: { sm: 0.25 } }}>
          <Button type="submit" variant="contained" disabled={salvando || (obrigatorio && !editado.trim()) || editado.trim() === valor}>Salvar</Button>
          <Button variant="outlined" onClick={() => setEditado(null)} disabled={salvando}>Cancelar</Button>
        </Stack>
      </Stack>
      {campo === 'local' && sugestoesDoLote && <SugestoesDoLote carregar={sugestoesDoLote} onEscolher={(local) => setEditado(local.slice(0, LIMITES.local))} />}
    </Stack>
  );
}
