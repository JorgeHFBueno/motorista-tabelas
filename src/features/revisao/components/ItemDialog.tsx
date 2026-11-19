import {
  AppBar, Box, Button, Chip, CircularProgress, Dialog, IconButton, MenuItem, Stack, TextField, ToggleButton,
  ToggleButtonGroup, Toolbar, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import PhotoLibraryOutlinedIcon from '@mui/icons-material/PhotoLibraryOutlined';
import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { useRef, useState, type ChangeEvent } from 'react';
import { processarFoto } from '../../checklist-mecanico/data/fotoProcessamento';
import { dataOriginalDaFoto, textoCarimbo } from '../../checklist-mecanico/domain/foto';
import type { ChecklistFoto, OrigemFoto } from '../../checklist-mecanico/domain/rascunho';
import { apagarArquivos, chaveArquivo, salvarArquivo } from '../data/armazenamentoLocal';
import { fotoRemota } from '../domain/documento';
import { ACOES, CATEGORIAS, EIXOS, LADOS, UNIDADES, type CategoriaId, type UnidadeId } from '../domain/listas';
import { comItem, ehRascunho, itemDe, type RevisaoItem, type RevisaoRegistro } from '../domain/registro';
import { comMotivo, sugestoesDePeca, textoNumero } from '../domain/regras';
import { FotoItem } from './Fotos';

/** Quantidade digitada ("1,5" ou "1.5"); vazio ou inválido → null. */
const lerQuantidade = (texto: string) => {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
};

/**
 * Um item da revisão, como a ManutencaoItemPage do app, em tela cheia no celular. As mudanças vão direto para o registro;
 * "Pronto" fecha.
 */
export default function ItemDialog({ registro, item, anteriores, pendencias, motivoInicial, onAlterar, onAviso, onFechar }: {
  registro: RevisaoRegistro;
  item: RevisaoItem;
  anteriores: Partial<Record<CategoriaId, string[]>>;
  pendencias: string[];
  motivoInicial: string;
  onAlterar: (mudar: (r: RevisaoRegistro) => RevisaoRegistro) => void;
  onAviso: (texto: string) => void;
  onFechar: () => void;
}) {
  const telaCheia = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [motivo, setMotivo] = useState(motivoInicial);
  const [quantidade, setQuantidade] = useState(item.quantidade == null ? '' : textoNumero(item.quantidade));
  const [obtendoFoto, setObtendoFoto] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const { itemId } = item;

  /** Muda o item mais novo do registro (o que está na tela pode estar um passo atrás). */
  const atualizar = (mudar: (i: RevisaoItem) => RevisaoItem) =>
    onAlterar((r) => {
      const atual = itemDe(r, itemId);
      return atual ? comItem(r, mudar(atual)) : r;
    });

  const definirMotivo = (texto: string) => {
    setMotivo(texto);
    onAlterar((r) => {
      const atual = itemDe(r, itemId);
      return atual ? comItem(r, comMotivo(atual, texto, r)) : r;
    });
  };

  const usarMotivoGeral = () => {
    setMotivo(registro.motivo);
    atualizar((i) => ({ ...i, motivo: null }));
  };

  const definirQuantidade = (texto: string) => {
    setQuantidade(texto);
    const valor = lerQuantidade(texto);
    // Ao digitar a quantidade, a unidade começa em "un".
    atualizar((i) => ({ ...i, quantidade: valor, unidade: valor != null && i.unidade == null ? 'un' : i.unidade }));
  };

  /** Foto da câmera (hora do aparelho) ou da galeria (data do EXIF), processada como no Checklist e guardada no aparelho. */
  const adicionarFoto = async (arquivo: File, origem: OrigemFoto) => {
    setObtendoFoto(true);
    try {
      const capturadaEm = origem === 'camera' ? new Date() : dataOriginalDaFoto(new Uint8Array(await arquivo.slice(0, 256 * 1024).arrayBuffer()));
      const processada = await processarFoto(arquivo, textoCarimbo(origem, capturadaEm));
      // O nome vira o do Storage (`<itemId>_<n>.jpg`, n único por foto).
      const nome = `${itemId}_${Date.now()}`;
      const foto: ChecklistFoto = {
        arquivo: chaveArquivo(registro.id, `${nome}.jpg`),
        miniatura: chaveArquivo(registro.id, `${nome}_min.jpg`),
        origem,
        capturadaEm,
        bytes: processada.foto.size,
        largura: processada.largura,
        altura: processada.altura,
      };
      await salvarArquivo(foto.arquivo, processada.foto);
      await salvarArquivo(foto.miniatura, processada.miniatura);
      atualizar((i) => ({ ...i, fotos: [...i.fotos, foto] }));
    } catch (error) {
      console.error('Revisão: falha ao usar a foto', error);
      onAviso('Não foi possível usar essa foto. Tente de novo.');
    } finally {
      setObtendoFoto(false);
    }
  };

  const escolheu = (origem: OrigemFoto) => (e: ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (arquivo) void adicionarFoto(arquivo, origem);
  };

  const removerFoto = (foto: ChecklistFoto) => {
    atualizar((i) => ({ ...i, fotos: i.fotos.filter((f) => f.arquivo !== foto.arquivo) }));
    // Só apaga o arquivo enquanto o registro nunca foi salvo: depois, uma revisão salva pode estar esperando para enviá-lo.
    if (ehRascunho(registro) && !fotoRemota(foto)) void apagarArquivos([foto.arquivo, foto.miniatura]);
  };

  const sugestoes = sugestoesDePeca(item.categoria, item.peca, item.categoria ? anteriores[item.categoria] ?? [] : [], 10);
  const motivoProprio = item.motivo != null;

  return (
    <Dialog open onClose={onFechar} fullScreen={telaCheia} fullWidth maxWidth="sm">
      <AppBar position="sticky" color="primary" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="inherit" aria-label="Fechar" onClick={onFechar}><CloseRoundedIcon /></IconButton>
          <Typography variant="h6" sx={{ flex: 1, ml: 1 }}>Item da revisão</Typography>
        </Toolbar>
      </AppBar>
      <Stack spacing={2.5} sx={{ p: 2 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Categoria</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
            {CATEGORIAS.map((c) => (
              <Chip key={c.id} label={c.titulo} color={item.categoria === c.id ? 'primary' : 'default'} variant={item.categoria === c.id ? 'filled' : 'outlined'}
                onClick={() => atualizar((i) => ({ ...i, categoria: c.id }))} />
            ))}
          </Stack>
        </Box>
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Ação</Typography>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
            {ACOES.map((a) => (
              <Chip key={a.id} label={a.titulo} color={item.acao === a.id ? 'primary' : 'default'} variant={item.acao === a.id ? 'filled' : 'outlined'}
                onClick={() => atualizar((i) => ({ ...i, acao: a.id }))} />
            ))}
          </Stack>
        </Box>
        <Stack spacing={1}>
          <TextField
            label="Peça / serviço"
            placeholder="Ex.: lona de freio"
            value={item.peca}
            onChange={(e) => atualizar((i) => ({ ...i, peca: e.target.value }))}
            slotProps={{ htmlInput: { autoCapitalize: 'sentences' } }}
          />
          {sugestoes.length > 0 && (
            <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
              {sugestoes.map((s) => <Chip key={s} size="small" label={s} onClick={() => atualizar((i) => ({ ...i, peca: s }))} />)}
            </Stack>
          )}
        </Stack>
        <TextField
          label="Motivo"
          value={motivo}
          onChange={(e) => definirMotivo(e.target.value)}
          multiline
          minRows={1}
          maxRows={3}
          helperText={motivoProprio ? 'Motivo próprio deste item' : 'Igual ao motivo geral'}
          slotProps={{
            htmlInput: { autoCapitalize: 'sentences' },
            input: motivoProprio ? { endAdornment: <IconButton aria-label="Usar o motivo geral" onClick={usarMotivoGeral}><UndoRoundedIcon /></IconButton> } : undefined,
          }}
        />
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Posição (opcional)</Typography>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <ToggleButtonGroup exclusive size="small" value={item.eixo} onChange={(_, eixo) => atualizar((i) => ({ ...i, eixo }))}>
              {EIXOS.map((e) => <ToggleButton key={e.id} value={e.id} sx={{ textTransform: 'none', px: 2 }}>{e.titulo}</ToggleButton>)}
            </ToggleButtonGroup>
            <ToggleButtonGroup exclusive size="small" value={item.lado} onChange={(_, lado) => atualizar((i) => ({ ...i, lado }))}>
              {LADOS.map((l) => <ToggleButton key={l.id} value={l.id} sx={{ textTransform: 'none', px: 2 }}>{l.titulo}</ToggleButton>)}
            </ToggleButtonGroup>
          </Stack>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <TextField
            label="Quantidade (opcional)"
            value={quantidade}
            onChange={(e) => definirQuantidade(e.target.value.replace(/[^\d.,]/g, ''))}
            sx={{ flex: 1 }}
            slotProps={{ htmlInput: { inputMode: 'decimal', autoComplete: 'off' } }}
          />
          <TextField
            select
            label="Unidade"
            value={item.unidade ?? ''}
            onChange={(e) => atualizar((i) => ({ ...i, unidade: (e.target.value || null) as UnidadeId | null }))}
            sx={{ width: 120 }}
          >
            <MenuItem value="">—</MenuItem>
            {UNIDADES.map((u) => <MenuItem key={u.id} value={u.id}>{u.titulo}</MenuItem>)}
          </TextField>
        </Stack>
        <TextField
          label="Marca / especificação (opcional)"
          placeholder="Ex.: Petronas Urania 15W40"
          value={item.especificacao}
          onChange={(e) => atualizar((i) => ({ ...i, especificacao: e.target.value }))}
        />
        <TextField label="Nº da nota do item (opcional)" value={item.numeroNota} onChange={(e) => atualizar((i) => ({ ...i, numeroNota: e.target.value }))} />
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Fotos (opcional)</Typography>
          {item.fotos.length > 0 && (
            <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', pt: 1.25, pr: 1.5, mb: 1.5 }}>
              {item.fotos.map((f) => <FotoItem key={f.arquivo} foto={f} onRemover={() => removerFoto(f)} />)}
            </Stack>
          )}
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={escolheu('camera')} />
          <input ref={galeria} type="file" accept="image/*" hidden onChange={escolheu('galeria')} />
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="outlined" startIcon={<PhotoCameraOutlinedIcon />} disabled={obtendoFoto} onClick={() => camera.current?.click()} sx={{ minHeight: 44 }}>Câmera</Button>
            <Button variant="outlined" startIcon={<PhotoLibraryOutlinedIcon />} disabled={obtendoFoto} onClick={() => galeria.current?.click()} sx={{ minHeight: 44 }}>Galeria</Button>
            {obtendoFoto && <CircularProgress size={22} aria-label="Preparando a foto" />}
          </Stack>
        </Box>
        {pendencias.map((p) => <Typography key={p} variant="body2" color="error">{p}</Typography>)}
        <Button variant="contained" size="large" onClick={onFechar} sx={{ minHeight: 52, fontWeight: 700 }}>Pronto</Button>
      </Stack>
    </Dialog>
  );
}
