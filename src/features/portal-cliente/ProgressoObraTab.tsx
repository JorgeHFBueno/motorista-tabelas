import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
  Slider,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { salvarProgresso } from './contratosPortalData';
import { usePessoaAtual } from './portalArquivos';
import type { ContratoPortal } from './portalDominio';
import {
  limitarProgresso,
  novoIdProgresso,
  progressoPadrao,
  progressoParaGravar,
  recalcularProgresso,
  renumerarProgresso,
  ROTULOS_STATUS,
  type EtapaProgresso,
  type ModoControle,
  type ProgressoObra,
  type StatusProgresso,
} from './progressoObra';

// Progress of the contract shown to the client (portal-obras.progresso, The Manuscript portal.md, "Progresso"), typed by
// adm2. Port of the old staff editor of the portal (StaffObraStatusTab): stages with items, percent or checklist.

const COR_STATUS: Record<StatusProgresso, 'default' | 'info' | 'warning' | 'success'> = {
  pendente: 'default',
  em_andamento: 'info',
  finalizando: 'warning',
  completo: 'success',
};

function Barra({ valor }: { valor: number }) {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      <LinearProgress variant="determinate" value={valor} sx={{ flex: 1, height: 8, borderRadius: 4 }} />
      <Typography sx={{ minWidth: 44, textAlign: 'right', fontWeight: 700 }}>{valor}%</Typography>
    </Stack>
  );
}

export default function ProgressoObraTab({ contrato }: { contrato: ContratoPortal }) {
  const pessoa = usePessoaAtual();
  const salvo = useMemo(() => recalcularProgresso(contrato.progresso), [contrato.progresso]);
  const [rascunho, setRascunho] = useState<ProgressoObra | null>(null);
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const atual = rascunho ?? salvo;

  const alterar = (mudar: (progresso: ProgressoObra) => ProgressoObra) => setRascunho(renumerarProgresso(mudar(atual)));
  const alterarEtapa = (etapaId: string, mudar: (etapa: EtapaProgresso) => EtapaProgresso) =>
    alterar((progresso) => ({ ...progresso, etapas: progresso.etapas.map((etapa) => (etapa.id === etapaId ? mudar(etapa) : etapa)) }));
  const alterarItem = (etapaId: string, itemId: string, mudanca: { nome?: string; progresso?: number }) =>
    alterarEtapa(etapaId, (etapa) => ({ ...etapa, itens: etapa.itens.map((item) => (item.id === itemId ? { ...item, ...mudanca } : item)) }));

  const adicionarEtapa = () => {
    const id = novoIdProgresso('etapa');
    alterar((progresso) => ({
      ...progresso,
      etapas: [...progresso.etapas, { id, nome: 'Nova etapa', ordem: progresso.etapas.length + 1, modoControle: 'checklist', progresso: 0, status: 'pendente', itens: [] }],
    }));
    setAbertas((estado) => ({ ...estado, [id]: true }));
  };

  const adicionarItem = (etapaId: string) =>
    alterarEtapa(etapaId, (etapa) => ({
      ...etapa,
      itens: [...etapa.itens, { id: novoIdProgresso('item'), nome: `Novo item ${etapa.itens.length + 1}`, ordem: etapa.itens.length + 1, progresso: 0, status: 'pendente' }],
    }));

  const salvar = async () => {
    if (!rascunho || !pessoa) return;
    const progresso = progressoParaGravar(rascunho);
    if (!progresso) {
      setErro('Toda etapa e todo item precisam de nome.');
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await salvarProgresso(contrato.id, progresso, pessoa);
      setRascunho(null);
      setAviso('Progresso salvo.');
    } catch (err) {
      console.error('Erro ao salvar o progresso do contrato', err);
      setErro('Não foi possível salvar o progresso.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Box>
            <Typography variant="h6">Progresso geral da obra</Typography>
            <Typography variant="body2" color="text.secondary">
              Média simples das etapas; cada etapa é a média dos seus itens, em percentual informado ou em checklist (feito ou não).
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} justifyContent="flex-end" flexShrink={0}>
            <Button startIcon={<AddIcon />} variant="outlined" onClick={adicionarEtapa} disabled={salvando}>Adicionar etapa</Button>
          </Stack>
        </Stack>
        <Box mt={2}><Barra valor={atual.progressoGeral} /></Box>
        {rascunho && (
          <Alert
            severity="warning"
            sx={{ mt: 2 }}
            action={(
              <Stack direction="row" spacing={1}>
                <Button color="inherit" size="small" onClick={() => { setRascunho(null); setErro(null); }} disabled={salvando}>Descartar</Button>
                <Button color="inherit" size="small" variant="outlined" onClick={() => void salvar()} disabled={salvando || !pessoa}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </Button>
              </Stack>
            )}
          >
            Alterações não salvas: o cliente ainda vê o progresso anterior.
          </Alert>
        )}
        {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      </Paper>

      {atual.etapas.length === 0 ? (
        <Alert
          severity="info"
          action={<Button color="inherit" size="small" onClick={() => setRascunho(progressoPadrao())} disabled={salvando}>Usar o modelo padrão</Button>}
        >
          Nenhuma etapa cadastrada. Adicione uma etapa ou use o modelo padrão (Projeto, Produção, Fundação e Montagem).
        </Alert>
      ) : atual.etapas.map((etapa) => (
        <Accordion
          key={etapa.id}
          disableGutters
          variant="outlined"
          expanded={abertas[etapa.id] ?? false}
          onChange={(_event, aberta) => setAbertas((estado) => ({ ...estado, [etapa.id]: aberta }))}
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontWeight: 700 }}>{etapa.nome || 'Sem nome'}</Typography>
                <Chip size="small" color={COR_STATUS[etapa.status]} label={ROTULOS_STATUS[etapa.status]} />
                <Chip size="small" variant="outlined" label={etapa.modoControle === 'checklist' ? 'Checklist' : 'Percentual'} />
                <Typography variant="body2" color="text.secondary">{etapa.itens.length} {etapa.itens.length === 1 ? 'item' : 'itens'}</Typography>
              </Stack>
              <Box mt={1}><Barra valor={etapa.progresso} /></Box>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ borderTop: 1, borderColor: 'divider' }}>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  size="small"
                  label="Nome da etapa"
                  value={etapa.nome}
                  onChange={(event) => alterarEtapa(etapa.id, (e) => ({ ...e, nome: event.target.value }))}
                  disabled={salvando}
                  sx={{ flex: 1 }}
                />
                <TextField
                  select
                  size="small"
                  label="Acompanhamento"
                  value={etapa.modoControle}
                  onChange={(event) => alterarEtapa(etapa.id, (e) => ({ ...e, modoControle: event.target.value as ModoControle }))}
                  disabled={salvando}
                  sx={{ minWidth: 200 }}
                  helperText={etapa.modoControle === 'checklist' ? 'Cada item: feito (100%) ou não (0%).' : 'Cada item: percentual de 0 a 100.'}
                >
                  <MenuItem value="checklist">Checklist</MenuItem>
                  <MenuItem value="percentual">Percentual</MenuItem>
                </TextField>
              </Stack>

              {etapa.itens.length === 0 && <Typography variant="body2" color="text.secondary">Esta etapa ainda não tem itens.</Typography>}
              {etapa.itens.map((item) => (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }}>
                    <TextField
                      size="small"
                      label="Item"
                      value={item.nome}
                      onChange={(event) => alterarItem(etapa.id, item.id, { nome: event.target.value })}
                      disabled={salvando}
                      sx={{ flex: 1 }}
                    />
                    {etapa.modoControle === 'checklist' ? (
                      <FormControlLabel
                        control={(
                          <Checkbox
                            checked={item.progresso >= 100}
                            onChange={(event) => alterarItem(etapa.id, item.id, { progresso: event.target.checked ? 100 : 0 })}
                            disabled={salvando}
                          />
                        )}
                        label="Concluído"
                      />
                    ) : (
                      <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: { md: 320 } }}>
                        <Slider
                          value={item.progresso}
                          onChange={(_event, valor) => alterarItem(etapa.id, item.id, { progresso: limitarProgresso(valor) })}
                          min={0}
                          max={100}
                          step={5}
                          disabled={salvando}
                          aria-label={`Progresso de ${item.nome}`}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          value={item.progresso}
                          onChange={(event) => alterarItem(etapa.id, item.id, { progresso: limitarProgresso(event.target.value) })}
                          disabled={salvando}
                          slotProps={{ htmlInput: { min: 0, max: 100, step: 1, 'aria-label': `Percentual de ${item.nome}` } }}
                          sx={{ width: 90 }}
                        />
                      </Stack>
                    )}
                    <Chip size="small" color={COR_STATUS[item.status]} label={ROTULOS_STATUS[item.status]} sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }} />
                    <Tooltip title="Excluir item">
                      <span>
                        <IconButton
                          aria-label={`Excluir o item ${item.nome}`}
                          onClick={() => alterarEtapa(etapa.id, (e) => ({ ...e, itens: e.itens.filter((i) => i.id !== item.id) }))}
                          disabled={salvando}
                        >
                          <DeleteOutlineIcon />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Stack>
                </Paper>
              ))}

              <Stack direction="row" spacing={1} justifyContent="space-between">
                <Button startIcon={<AddIcon />} onClick={() => adicionarItem(etapa.id)} disabled={salvando}>Adicionar item</Button>
                <Button
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => {
                    if (!window.confirm(`Excluir a etapa "${etapa.nome}" e os seus itens?`)) return;
                    alterar((progresso) => ({ ...progresso, etapas: progresso.etapas.filter((e) => e.id !== etapa.id) }));
                  }}
                  disabled={salvando}
                >
                  Excluir etapa
                </Button>
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>
      ))}
      <Snackbar open={!!aviso} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} />
    </Stack>
  );
}
