import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import type { PessoaV2 } from '../../utils/cadastrosV2';
import { abrirArquivo, usePessoaAtual } from '../portal-cliente/portalArquivos';
import {
  adicionarAtualizacao, apagarArquivoNegocio, apagarAtualizacao, criarNegocio, editarNegocio, enviarArquivoNegocio,
  negocioParaLixeira, ouvirAtualizacoes, restaurarNegocio, type AtualizacaoNegocio,
} from './comercialDados';
import {
  GRUPOS_ARQUIVO, MOTIVOS_PERDA, ORIGENS, PRIORIDADES, SEGMENTOS, TIPOS_NEGOCIO, duracaoDias, etapasDoSegmento,
  formatarMoeda, hojeBrasilia, lerNumero, negocioFormVazio, negocioParaForm, situacao, validarNegocio,
  type ArquivoNegocio, type Contato, type GrupoArquivo, type Negocio, type NegocioForm,
} from './comercialDominio';

type Props = {
  /** Negócio aberto; null cria um novo com o id já gerado. */
  negocio: Negocio | null;
  novoId: string;
  inicial?: Partial<NegocioForm>;
  contatos: Contato[];
  pessoas: PessoaV2[];
  podeEditar: boolean;
  onClose: () => void;
  onAviso: (mensagem: string) => void;
};

const formatarBytes = (b: number) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const dataHora = (d: Date | null) => (d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

export default function NegocioDialog({ negocio, novoId, inicial, contatos, pessoas, podeEditar, onClose, onAviso }: Props) {
  const autor = usePessoaAtual();
  const hoje = hojeBrasilia();
  const id = negocio?.id ?? novoId;
  const [form, setForm] = useState<NegocioForm>(() => ({ ...(negocio ? negocioParaForm(negocio) : negocioFormVazio(hoje)), ...inicial }));
  const [arquivos, setArquivos] = useState<ArquivoNegocio[]>(negocio?.arquivos ?? []);
  const [enviadosAgora, setEnviadosAgora] = useState<string[]>([]);
  const [grupoArquivo, setGrupoArquivo] = useState<GrupoArquivo>('referencias');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const editavel = podeEditar && !negocio?.excluidoEm;
  const set = <K extends keyof NegocioForm>(campo: K, valor: NegocioForm[K]) => setForm((f) => ({ ...f, [campo]: valor }));

  const opcoesResponsaveis = useMemo(() => [...new Set([...form.responsaveis, ...pessoas.map((p) => p.uid)])], [form.responsaveis, pessoas]);
  const nomePessoa = (uid: string) => pessoas.find((p) => p.uid === uid)?.nome ?? 'Pessoa sem cadastro ativo';
  const contatosAtivos = useMemo(() => contatos.filter((c) => !c.excluidoEm || form.contatoIds.includes(c.id)), [contatos, form.contatoIds]);
  const contatosEscolhidos = contatosAtivos.filter((c) => form.contatoIds.includes(c.id));
  const etapas = etapasDoSegmento(form.segmento);
  const fechado = situacao({ etapa: form.etapa });
  const valor = lerNumero(form.valor);
  const metragem = lerNumero(form.metragem);
  const m2 = valor != null && metragem && !Number.isNaN(valor) && !Number.isNaN(metragem) ? valor / metragem : null;
  const dias = negocio ? duracaoDias({ ...negocio, etapa: form.etapa, dataFechamento: form.dataFechamento || null, dataCriacao: form.dataCriacao }, hoje) : null;

  async function enviarArquivos(files: FileList | null) {
    if (!files?.length) return;
    setOcupado(true);
    setErro(null);
    try {
      for (const file of Array.from(files)) {
        const novo = await enviarArquivoNegocio(id, file, grupoArquivo);
        setArquivos((a) => [...a, novo]);
        setEnviadosAgora((e) => [...e, novo.path]);
      }
    } catch (err) {
      console.error('Erro ao enviar arquivo do negócio', err);
      setErro(err instanceof Error && err.message.includes('25 MB') ? err.message : 'Não foi possível enviar o arquivo.');
    } finally {
      setOcupado(false);
    }
  }

  /** Fechar sem salvar apaga do Storage o que foi enviado nesta abertura. */
  async function cancelar() {
    if (enviadosAgora.length) await Promise.allSettled(enviadosAgora.map(apagarArquivoNegocio));
    onClose();
  }

  async function salvar() {
    const problema = validarNegocio(form);
    if (problema) { setErro(problema); return; }
    if (!autor) return;
    setOcupado(true);
    setErro(null);
    try {
      if (negocio) await editarNegocio(negocio.id, form, arquivos, autor, hoje);
      else await criarNegocio(id, form, arquivos, autor, hoje);
      // Arquivos tirados da lista saem do Storage depois de gravar o negócio sem eles.
      const removidos = [...(negocio?.arquivos ?? []).map((a) => a.path), ...enviadosAgora].filter((p) => !arquivos.some((b) => b.path === p));
      await Promise.allSettled(removidos.map(apagarArquivoNegocio));
      onAviso(negocio ? 'Negócio salvo.' : 'Negócio criado.');
      onClose();
    } catch (err) {
      console.error('Erro ao salvar o negócio', err);
      setErro('Não foi possível salvar o negócio. Tente novamente.');
      setOcupado(false);
    }
  }

  async function alternarLixeira() {
    if (!negocio || !autor) return;
    setOcupado(true);
    try {
      if (negocio.excluidoEm) await restaurarNegocio(negocio.id, autor);
      else await negocioParaLixeira(negocio.id, autor);
      onAviso(negocio.excluidoEm ? 'Negócio restaurado.' : 'Negócio movido para a lixeira.');
      onClose();
    } catch (err) {
      console.error('Erro ao mover o negócio', err);
      setErro('Não foi possível alterar o negócio.');
      setOcupado(false);
    }
  }

  return (
    <Dialog open onClose={ocupado ? undefined : cancelar} fullWidth maxWidth="md">
      <DialogTitle sx={{ pr: 6 }}>
        {negocio ? negocio.titulo || 'Negócio' : 'Novo negócio'}
        {negocio?.excluidoEm && <Chip size="small" color="error" label="Na lixeira" sx={{ ml: 1 }} />}
        <IconButton aria-label="Fechar" onClick={cancelar} disabled={ocupado} sx={{ position: 'absolute', right: 12, top: 12 }}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Negócio" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} required fullWidth disabled={!editavel} autoFocus={!negocio} />
            <TextField label="Cliente" value={form.cliente} onChange={(e) => set('cliente', e.target.value)} fullWidth disabled={!editavel} />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField select label="Segmento" value={form.segmento} fullWidth disabled={!editavel}
              onChange={(e) => {
                const segmento = e.target.value as NegocioForm['segmento'];
                setForm((f) => ({ ...f, segmento, etapa: segmento === 'privado' && f.etapa === 'licitado' ? 'proposta_enviada' : f.etapa }));
              }}>
              {SEGMENTOS.map((s) => <MenuItem key={s.id} value={s.id}>{s.rotulo}</MenuItem>)}
            </TextField>
            <TextField select label="Tipo" value={form.tipo} onChange={(e) => set('tipo', e.target.value as NegocioForm['tipo'])} fullWidth disabled={!editavel}>
              {TIPOS_NEGOCIO.map((s) => <MenuItem key={s.id} value={s.id}>{s.rotulo}</MenuItem>)}
            </TextField>
            <TextField select label="Etapa" value={form.etapa} onChange={(e) => set('etapa', e.target.value as NegocioForm['etapa'])} fullWidth disabled={!editavel}>
              {etapas.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  <Box component="span" sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.cor, mr: 1, display: 'inline-block' }} />{s.rotulo}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete
              multiple
              fullWidth
              options={opcoesResponsaveis}
              value={form.responsaveis}
              getOptionLabel={(uid) => nomePessoa(uid)}
              onChange={(_e, valor) => set('responsaveis', valor.slice(0, 10))}
              disabled={!editavel}
              renderInput={(params) => <TextField {...params} label="Responsáveis" />}
            />
            <TextField select label="Prioridade" value={form.prioridade} onChange={(e) => set('prioridade', e.target.value as NegocioForm['prioridade'])} fullWidth disabled={!editavel}>
              <MenuItem value="">—</MenuItem>
              {PRIORIDADES.map((s) => <MenuItem key={s.id} value={s.id}>{s.rotulo}</MenuItem>)}
            </TextField>
            <TextField select label="Origem" value={form.origem} onChange={(e) => set('origem', e.target.value as NegocioForm['origem'])} fullWidth disabled={!editavel}>
              <MenuItem value="">—</MenuItem>
              {ORIGENS.map((s) => <MenuItem key={s.id} value={s.id}>{s.rotulo}</MenuItem>)}
            </TextField>
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Valor do negócio" value={form.valor} onChange={(e) => set('valor', e.target.value)} fullWidth disabled={!editavel}
              slotProps={{ input: { startAdornment: <InputAdornment position="start">R$</InputAdornment> } }} />
            <TextField label="Metragem" value={form.metragem} onChange={(e) => set('metragem', e.target.value)} fullWidth disabled={!editavel}
              slotProps={{ input: { endAdornment: <InputAdornment position="end">m²</InputAdornment> } }} />
            <TextField label="Valor do m²" value={m2 == null ? '—' : formatarMoeda(m2)} fullWidth disabled />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField type="date" label="Criado em" value={form.dataCriacao} onChange={(e) => set('dataCriacao', e.target.value)} fullWidth disabled={!editavel}
              slotProps={{ inputLabel: { shrink: true } }} />
            <TextField type="date" label="Fechamento" value={form.dataFechamento} onChange={(e) => set('dataFechamento', e.target.value)} fullWidth disabled={!editavel}
              helperText={fechado !== 'aberto' && !form.dataFechamento ? 'Sem data, fica a de hoje ao salvar.' : ' '}
              slotProps={{ inputLabel: { shrink: true } }} />
            {fechado === 'perdido' ? (
              <TextField select label="Motivo da perda" value={form.motivoPerda} onChange={(e) => set('motivoPerda', e.target.value as NegocioForm['motivoPerda'])} fullWidth disabled={!editavel}>
                <MenuItem value="">—</MenuItem>
                {MOTIVOS_PERDA.map((s) => <MenuItem key={s.id} value={s.id}>{s.rotulo}</MenuItem>)}
              </TextField>
            ) : (
              <TextField label="Duração" value={dias == null ? '—' : `${dias} dia${dias === 1 ? '' : 's'}`} fullWidth disabled />
            )}
          </Stack>

          <Autocomplete
            multiple
            options={contatosAtivos}
            value={contatosEscolhidos}
            getOptionLabel={(c) => (c.empresa ? `${c.nome} · ${c.empresa}` : c.nome)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_e, valor) => set('contatoIds', valor.map((c) => c.id))}
            disabled={!editavel}
            renderInput={(params) => <TextField {...params} label="Contatos" placeholder={editavel ? 'Buscar contato' : undefined} />}
          />

          <Divider />
          <Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent="space-between" mb={1}>
              <Typography variant="subtitle2">Arquivos</Typography>
              {editavel && (
                <Stack direction="row" spacing={1} alignItems="center">
                  <TextField select size="small" label="Grupo" value={grupoArquivo} onChange={(e) => setGrupoArquivo(e.target.value as GrupoArquivo)} sx={{ minWidth: 160 }}>
                    {GRUPOS_ARQUIVO.map((g) => <MenuItem key={g.id} value={g.id}>{g.rotulo}</MenuItem>)}
                  </TextField>
                  <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} disabled={ocupado}>
                    Anexar
                    <input hidden type="file" multiple onChange={(e) => { void enviarArquivos(e.target.files); e.target.value = ''; }} />
                  </Button>
                </Stack>
              )}
            </Stack>
            {!arquivos.length ? (
              <Typography variant="body2" color="text.secondary">Nenhum arquivo.</Typography>
            ) : GRUPOS_ARQUIVO.filter((g) => arquivos.some((a) => a.grupo === g.id)).map((g) => (
              <Box key={g.id} mb={1}>
                <Typography variant="caption" color="text.secondary">{g.rotulo}</Typography>
                <List dense disablePadding>
                  {arquivos.filter((a) => a.grupo === g.id).map((a) => (
                    <ListItem key={a.path} disableGutters secondaryAction={
                      <Stack direction="row">
                        <Tooltip title="Abrir"><IconButton size="small" onClick={async () => { if (!(await abrirArquivo(a))) setErro('Não foi possível abrir o arquivo.'); }}><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
                        {editavel && <Tooltip title="Tirar do negócio"><IconButton size="small" onClick={() => setArquivos((l) => l.filter((b) => b.path !== a.path))}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>}
                      </Stack>
                    }>
                      <ListItemText primary={a.nome} secondary={formatarBytes(a.bytes)} slotProps={{ primary: { sx: { overflowWrap: 'anywhere', pr: 8 } } }} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            ))}
          </Box>

          {negocio && <LinhaDoTempo negocioId={negocio.id} podeEditar={editavel} />}

          {negocio?.origemFriday && (
            <Typography variant="caption" color="text.secondary">
              Trazido do Friday{negocio.origemFriday.quadro ? ` (${negocio.origemFriday.quadro})` : ''}.
              {negocio.atualizadoPor?.nome ? ` Última alteração: ${negocio.atualizadoPor.nome}, ${dataHora(negocio.atualizadoEm)}.` : ''}
            </Typography>
          )}
          {erro && <Alert severity="error">{erro}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Box>
          {negocio && podeEditar && (
            <Button color={negocio.excluidoEm ? 'primary' : 'error'} onClick={alternarLixeira} disabled={ocupado || !autor}>
              {negocio.excluidoEm ? 'Restaurar' : 'Mover para a lixeira'}
            </Button>
          )}
        </Box>
        <Box>
          <Button onClick={cancelar} disabled={ocupado}>{editavel ? 'Cancelar' : 'Fechar'}</Button>
          {editavel && <Button variant="contained" onClick={salvar} disabled={ocupado || !autor} sx={{ ml: 1 }}>{negocio ? 'Salvar' : 'Criar negócio'}</Button>}
        </Box>
      </DialogActions>
    </Dialog>
  );
}

function LinhaDoTempo({ negocioId, podeEditar }: { negocioId: string; podeEditar: boolean }) {
  const autor = usePessoaAtual();
  const [itens, setItens] = useState<AtualizacaoNegocio[] | null>(null);
  const [textoNovo, setTextoNovo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => ouvirAtualizacoes(negocioId, setItens, (err) => {
    console.error('Erro ao carregar as atualizações do negócio', err);
    setErro('Não foi possível carregar as atualizações.');
  }), [negocioId]);

  async function publicar() {
    if (!autor || !textoNovo.trim()) return;
    setEnviando(true);
    try {
      await adicionarAtualizacao(negocioId, textoNovo, autor);
      setTextoNovo('');
    } catch (err) {
      console.error('Erro ao publicar a atualização', err);
      setErro('Não foi possível publicar a atualização.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Box>
      <Divider sx={{ mb: 2 }} />
      <Typography variant="subtitle2" mb={1}>Atualizações</Typography>
      {podeEditar && (
        <Stack direction="row" spacing={1} mb={1}>
          <TextField size="small" fullWidth multiline maxRows={6} placeholder="Escreva uma atualização (ligação, visita, proposta...)" value={textoNovo}
            onChange={(e) => setTextoNovo(e.target.value)} slotProps={{ htmlInput: { maxLength: 5000 } }} />
          <Button variant="outlined" onClick={publicar} disabled={enviando || !textoNovo.trim() || !autor}>Publicar</Button>
        </Stack>
      )}
      {erro && <Alert severity="error" sx={{ mb: 1 }}>{erro}</Alert>}
      {itens && !itens.length && <Typography variant="body2" color="text.secondary">Nenhuma atualização.</Typography>}
      <Stack spacing={1}>
        {itens?.map((a) => (
          <Box key={a.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary">{a.autorNome} · {dataHora(a.criadoEm)}</Typography>
              {podeEditar && a.autor?.uid && a.autor.uid === autor?.uid && (
                <Tooltip title="Apagar"><IconButton size="small" onClick={() => apagarAtualizacao(negocioId, a.id).catch(() => setErro('Não foi possível apagar.'))}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
              )}
            </Stack>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.texto}</Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
