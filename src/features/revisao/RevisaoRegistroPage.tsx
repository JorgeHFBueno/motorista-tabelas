import {
  Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, Snackbar, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import MedidorCampo from '../checklist-mecanico/components/MedidorCampo';
import PaginaMotorista from '../saida-chegada/components/PaginaMotorista';
import {
  apagarArquivos, carregarRascunho, carregarRegistro, descartarRascunho, salvarRascunho, salvarRegistro,
} from './data/armazenamentoLocal';
import { enfileirar } from './data/filaEnvio';
import { obterRevisao } from './data/revisaoFirestore';
import { fotoRemota } from './domain/documento';
import { TIPOS, type RevisaoTipo } from './domain/listas';
import {
  comItem, diaDe, ehRascunho, estaAberta, exibirDia, horimetroDe, itemDe, itemVazio, novoItem, semItem,
  type Dia, type RevisaoItem, type RevisaoRegistro,
} from './domain/registro';
import {
  motivoDoItem, pecasAnteriores, pendenciasAoSalvar, pendenciasDoItem, pendenciasParaFechar, resumoDoItem, textoFotos, validarDatas,
} from './domain/regras';
import ItemDialog from './components/ItemDialog';

const ATRASO_GRAVAR_MS = 400;
const botaoGrande = { minHeight: 52, fontSize: 16, fontWeight: 700, textTransform: 'none' } as const;

/** O registro a editar: o da navegação, o rascunho, a cópia do aparelho ou o do servidor (o mais novo dos dois). */
async function carregar(id: string, daNavegacao: RevisaoRegistro | null): Promise<RevisaoRegistro | 'fechada' | null> {
  if (daNavegacao?.id === id) return daNavegacao;
  const rascunho = await carregarRascunho();
  if (rascunho?.id === id) return rascunho;
  const local = await carregarRegistro(id);
  const servidor = await obterRevisao(id).catch((error) => { console.warn('Revisão: sem o registro do servidor', error); return null; });
  if (servidor && !estaAberta(servidor.registro)) return 'fechada';
  if (local && servidor) return local.revisao >= servidor.registro.revisao ? local : servidor.registro;
  return local ?? servidor?.registro ?? null;
}

/**
 * /motorista/revisao/:id: um registro de manutenção, como a ManutencaoRegistroPage do app. Cada mudança fica guardada no
 * aparelho (rascunho até o primeiro "Salvar"); "Salvar" manda uma revisão nova para a fila (continua aberto) e "Fechar
 * revisão" salva com a data que voltou, fechando o registro.
 */
export default function RevisaoRegistroPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [registro, setRegistro] = useState<RevisaoRegistro | null>(null);

  useEffect(() => {
    let ativo = true;
    const daNavegacao = (location.state as { registro?: RevisaoRegistro } | null)?.registro ?? null;
    carregar(id, daNavegacao)
      .then((r) => {
        if (!ativo) return;
        if (r === 'fechada') navigate(`/motorista/revisao/historico/${encodeURIComponent(id)}`, { replace: true });
        else if (r) setRegistro(r);
        else navigate('/motorista/revisao', { replace: true });
      })
      .catch((error) => {
        console.error('Revisão: falha ao abrir o registro', error);
        if (ativo) navigate('/motorista/revisao', { replace: true });
      });
    return () => { ativo = false; };
    // A navegação traz o registro só na abertura; recarregar a página o lê do aparelho.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!registro) return <PaginaMotorista><Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack></PaginaMotorista>;
  return <Editor key={registro.id} inicial={registro} />;
}

function Editor({ inicial }: { inicial: RevisaoRegistro }) {
  const navigate = useNavigate();
  const { currentUser, authorizationProfile } = useAuth();
  const [registro, setRegistro] = useState(inicial);
  const [medidorTexto, setMedidorTexto] = useState(inicial.medidor == null ? '' : String(inicial.medidor));
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [itemAberto, setItemAberto] = useState<string | null>(null);
  const [remover, setRemover] = useState<RevisaoItem | null>(null);
  const [fechar, setFechar] = useState<{ faltas: string[] } | { retorno: Dia } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const atual = useRef(inicial);
  const timer = useRef<number | undefined>(undefined);
  const hoje = diaDe(new Date());

  const gravarAgora = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    const r = atual.current;
    (ehRascunho(r) ? salvarRascunho(r) : salvarRegistro(r)).catch((error) => console.error('Revisão: falha ao guardar no aparelho', error));
  }, []);

  // Guarda antes de sair da tela, fechar o app ou ir para outro aplicativo.
  useEffect(() => {
    const aoEsconder = () => { if (document.visibilityState === 'hidden' && timer.current !== undefined) gravarAgora(); };
    const aoSair = () => { if (timer.current !== undefined) gravarAgora(); };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', aoSair);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', aoSair);
      aoSair();
    };
  }, [gravarAgora]);

  const alterar = useCallback((mudar: (r: RevisaoRegistro) => RevisaoRegistro) => {
    const novo = { ...mudar(atual.current), alterado: true };
    atual.current = novo;
    setRegistro(novo);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(gravarAgora, ATRASO_GRAVAR_MS);
  }, [gravarAgora]);

  /** Salva uma revisão nova e a põe na fila; false (e destaca o que falta) quando há pendências. */
  const salvar = async (r: RevisaoRegistro): Promise<boolean> => {
    if (salvando || !currentUser) return false;
    if (pendenciasAoSalvar(r, hoje).length > 0) {
      setMostrar(true);
      return false;
    }
    setSalvando(true);
    try {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const salvo: RevisaoRegistro = { ...r, revisao: r.revisao + 1, alterado: false };
      await salvarRegistro(salvo);
      if (ehRascunho(r)) await descartarRascunho({ apagarArquivos: false });
      atual.current = salvo;
      setRegistro(salvo);
      setMostrar(false);
      await enfileirar(salvo, { uid: currentUser.uid, nome: authorizationProfile?.nome || currentUser.displayName || currentUser.email || '' });
      return true;
    } finally {
      setSalvando(false);
    }
  };

  const aoSalvar = async () => {
    try {
      setAviso(await salvar(registro) ? 'Revisão salva. Continua em manutenção.' : 'Confira o que falta antes de salvar.');
    } catch (error) {
      console.error('Revisão: falha ao salvar', error);
      setAviso('Não foi possível salvar. Tente de novo.');
    }
  };

  const aoFechar = () => {
    const faltas = pendenciasParaFechar(registro, hoje).map((p) => p.mensagem);
    if (faltas.length > 0) {
      setMostrar(true);
      setFechar({ faltas });
    } else {
      setFechar({ retorno: hoje });
    }
  };

  const confirmarFechar = async (retorno: Dia) => {
    setFechar(null);
    try {
      if (await salvar({ ...registro, dataRetorno: retorno, alterado: true })) {
        navigate('/motorista/revisao', { replace: true, state: { aviso: 'Revisão fechada. O envio continua em seguida.' } });
      } else {
        setAviso('Confira o que falta antes de fechar.');
      }
    } catch (error) {
      console.error('Revisão: falha ao fechar', error);
      setAviso('Não foi possível fechar. Tente de novo.');
    }
  };

  const adicionarItem = () => {
    const item = novoItem();
    alterar((r) => comItem(r, item));
    setItemAberto(item.itemId);
  };

  const fecharItem = () => {
    const item = itemAberto ? itemDe(atual.current, itemAberto) : null;
    if (item && itemVazio(item)) alterar((r) => semItem(r, item.itemId));
    setItemAberto(null);
  };

  const removerItem = (item: RevisaoItem) => {
    setRemover(null);
    alterar((r) => semItem(r, item.itemId));
    // Só apaga as fotos enquanto nunca foi salvo: depois, uma revisão salva pode estar esperando para enviá-las.
    if (ehRascunho(atual.current)) void apagarArquivos(item.fotos.filter((f) => !fotoRemota(f)).flatMap((f) => [f.arquivo, f.miniatura]));
  };

  const v = registro.veiculo;
  const horimetro = horimetroDe(v);
  const pendencias = mostrar ? pendenciasAoSalvar(registro, hoje) : [];
  const errosDatas = mostrar ? validarDatas(registro, hoje) : [];
  const erroData = (trecho: string) => errosDatas.find((e) => e.includes(trecho)) ?? null;
  const comPendencia = new Set(pendencias.map((p) => p.itemId).filter((i): i is string => i != null));
  // As que não aparecem junto de um campo (motivo, tipo, medidor e datas aparecem).
  const doCabecalho = pendencias.filter((p) => p.itemId == null && !errosDatas.includes(p.mensagem)
    && !['Informe o motivo.', 'Escolha Preventiva ou Corretiva.'].includes(p.mensagem) && !/^(Informe o |O (KM|horímetro) )/.test(p.mensagem));
  const erroMedidor = pendencias.find((p) => p.itemId == null && /^(Informe o (KM|horímetro)|O (KM|horímetro) )/.test(p.mensagem))?.mensagem ?? null;
  const item = itemAberto ? itemDe(registro, itemAberto) : null;
  const anteriores = pecasAnteriores([registro]);

  return (
    <PaginaMotorista>
      <Stack spacing={2} sx={{ pb: 10 }}>
        <Box>
          <Typography variant="h5" fontWeight={800}>{v.identificador}</Typography>
          {v.nome && <Typography color="text.secondary">{v.nome}</Typography>}
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Chip size="small" color="warning" variant="outlined" label={ehRascunho(registro) ? 'Ainda não salva' : 'Em manutenção'} />
            {!ehRascunho(registro) && registro.alterado && <Chip size="small" label="Alterações não salvas" />}
          </Stack>
        </Box>
        <MedidorCampo
          horimetro={horimetro}
          ultimo={v.medidorUltimo}
          texto={medidorTexto}
          onTexto={(t) => {
            setMedidorTexto(t);
            const valor = t === '' ? null : Number(t);
            if (valor !== atual.current.medidor) alterar((r) => ({ ...r, medidor: valor, medidorCorrigido: false }));
          }}
          corrigido={registro.medidorCorrigido}
          onCorrigido={(c) => alterar((r) => ({ ...r, medidorCorrigido: c }))}
          erro={erroMedidor}
        />
        <ToggleButtonGroup
          exclusive
          fullWidth
          color="primary"
          value={registro.tipo}
          onChange={(_, tipo: RevisaoTipo | null) => alterar((r) => ({ ...r, tipo }))}
        >
          {TIPOS.map((t) => <ToggleButton key={t.id} value={t.id} sx={botaoGrande}>{t.titulo}</ToggleButton>)}
        </ToggleButtonGroup>
        {mostrar && registro.tipo == null && <Typography variant="body2" color="error" sx={{ mt: -1 }}>Escolha Preventiva ou Corretiva.</Typography>}
        <TextField
          label="Motivo"
          value={registro.motivo}
          onChange={(e) => alterar((r) => ({ ...r, motivo: e.target.value }))}
          multiline
          minRows={2}
          maxRows={4}
          error={mostrar && registro.motivo.trim() === ''}
          helperText={mostrar && registro.motivo.trim() === '' ? 'Informe o motivo.' : 'Vale para todos os itens; cada item pode ter o seu.'}
          slotProps={{ htmlInput: { autoCapitalize: 'sentences' } }}
        />
        <TextField label="Nº da nota (opcional)" value={registro.numeroNota} onChange={(e) => alterar((r) => ({ ...r, numeroNota: e.target.value }))} />
        <CampoData
          rotulo="Data que parou (opcional)"
          valor={registro.dataParada}
          maximo={registro.dataEntrada ?? hoje}
          erro={erroData('que parou')}
          onChange={(dia) => alterar((r) => ({ ...r, dataParada: dia }))}
        />
        <CampoData
          rotulo="Data que foi ao mecânico"
          valor={registro.dataEntrada}
          maximo={hoje}
          erro={erroData('foi ao mecânico')}
          onChange={(dia) => alterar((r) => ({ ...r, dataEntrada: dia }))}
        />
        {doCabecalho.map((p) => <Typography key={p.mensagem} variant="body2" color="error">{p.mensagem}</Typography>)}

        <Typography variant="h6" sx={{ pt: 1 }}>Itens ({registro.itens.length})</Typography>
        {registro.itens.length === 0 && (
          <Typography color="text.secondary">Nenhum item ainda. Dá para salvar assim e lançar os itens depois; para fechar, é preciso ao menos um.</Typography>
        )}
        {registro.itens.map((i) => {
          const pendente = comPendencia.has(i.itemId);
          const resumo = resumoDoItem(i);
          const detalhes = [
            i.motivo != null ? `Motivo: ${i.motivo}` : null,
            i.especificacao.trim() || null,
            i.numeroNota.trim() ? `Nota ${i.numeroNota.trim()}` : null,
            i.fotos.length > 0 ? textoFotos(i.fotos.length) : null,
            pendente ? 'Incompleto: toque para completar' : null,
          ].filter(Boolean).join(' · ');
          return (
            <Card key={i.itemId} variant="outlined" sx={pendente ? { borderColor: 'error.main', borderWidth: 2 } : undefined}>
              <Stack direction="row" alignItems="center">
                <CardActionArea onClick={() => setItemAberto(i.itemId)} sx={{ flex: 1 }}>
                  <CardContent>
                    <Typography fontWeight={700}>{resumo || 'Item sem dados'}</Typography>
                    {detalhes && <Typography variant="body2" color={pendente ? 'error' : 'text.secondary'}>{detalhes}</Typography>}
                  </CardContent>
                </CardActionArea>
                <IconButton aria-label="Remover item" onClick={() => setRemover(i)} sx={{ mx: 1 }}><DeleteOutlineRoundedIcon /></IconButton>
              </Stack>
            </Card>
          );
        })}
        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={adicionarItem} sx={{ alignSelf: 'flex-start' }}>Adicionar item</Button>
      </Stack>

      {/* Salvar e Fechar sempre à mão, como a barra de baixo do app. */}
      <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', zIndex: 2, pb: 'env(safe-area-inset-bottom)' }}>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 640, mx: 'auto', p: 2 }}>
          <Button fullWidth variant="outlined" size="large" sx={botaoGrande} disabled={salvando} onClick={() => void aoSalvar()}>Salvar</Button>
          <Button fullWidth variant="contained" size="large" sx={botaoGrande} disabled={salvando} onClick={aoFechar}>
            {salvando ? <CircularProgress size={22} color="inherit" /> : 'Fechar revisão'}
          </Button>
        </Stack>
      </Box>

      {item && (
        <ItemDialog
          key={item.itemId}
          registro={registro}
          item={item}
          anteriores={anteriores}
          pendencias={mostrar ? pendenciasDoItem(item) : []}
          motivoInicial={motivoDoItem(registro, item)}
          onAlterar={alterar}
          onAviso={setAviso}
          onFechar={fecharItem}
        />
      )}

      <Dialog open={remover != null} onClose={() => setRemover(null)}>
        <DialogTitle>Remover item?</DialogTitle>
        <DialogContent>{remover && (resumoDoItem(remover) || 'Item sem dados.')}</DialogContent>
        <DialogActions>
          <Button onClick={() => setRemover(null)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => remover && removerItem(remover)}>Remover</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={fechar != null} onClose={() => setFechar(null)} fullWidth maxWidth="xs">
        {fechar && 'faltas' in fechar && (
          <>
            <DialogTitle>Ainda não dá para fechar</DialogTitle>
            <DialogContent>
              <Stack component="ul" spacing={0.5} sx={{ pl: 2, m: 0 }}>
                {fechar.faltas.map((f) => <li key={f}><Typography variant="body2">{f}</Typography></li>)}
              </Stack>
            </DialogContent>
            <DialogActions><Button variant="contained" onClick={() => setFechar(null)}>Entendi</Button></DialogActions>
          </>
        )}
        {fechar && 'retorno' in fechar && (
          <>
            <DialogTitle>Fechar a revisão?</DialogTitle>
            <DialogContent>
              <Stack spacing={2} sx={{ pt: 1 }}>
                <CampoData
                  rotulo="Data que voltou do mecânico"
                  valor={fechar.retorno}
                  minimo={registro.dataEntrada ?? undefined}
                  maximo={hoje}
                  onChange={(dia) => setFechar({ retorno: dia ?? hoje })}
                  semLimpar
                />
                <Typography variant="body2">
                  {v.identificador} voltou em {exibirDia(fechar.retorno)}. Depois de fechada, a revisão não muda mais.
                </Typography>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setFechar(null)}>Cancelar</Button>
              <Button variant="contained" onClick={() => void confirmarFechar(fechar.retorno)}>Fechar</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Snackbar open={aviso != null} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} />
    </PaginaMotorista>
  );
}

/** Data sem hora, no seletor de data do celular; "Limpar" nas opcionais. */
function CampoData({ rotulo, valor, minimo, maximo, erro, onChange, semLimpar }: {
  rotulo: string;
  valor: Dia | null;
  minimo?: Dia;
  maximo: Dia;
  erro?: string | null;
  onChange: (dia: Dia | null) => void;
  semLimpar?: boolean;
}) {
  return (
    <TextField
      type="date"
      label={rotulo}
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? (semLimpar ? valor : null) : e.target.value)}
      error={Boolean(erro)}
      helperText={erro ?? undefined}
      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minimo ?? '2020-01-01', max: maximo } }}
    />
  );
}
