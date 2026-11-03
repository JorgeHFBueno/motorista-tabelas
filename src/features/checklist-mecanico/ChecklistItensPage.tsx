import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Card, CardContent, CircularProgress,
  FormControlLabel, LinearProgress, Snackbar, Stack, Switch, Tab, Tabs, Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CATALOGOS, PARTES, usaHorimetro, type ParteId } from './domain/catalogo';
import {
  catalogoDoRascunho, comResposta, itensDoRascunho, respostaDe, type ChecklistAssinatura, type ChecklistFoto,
  type ChecklistMotorista, type ChecklistRascunho, type ChecklistStatus, type OrigemFoto,
} from './domain/rascunho';
import { dataOriginalDaFoto, textoCarimbo } from './domain/foto';
import {
  comMedidor, itensAtivos, itensNaoSeAplica, paginaDaPrimeiraPendencia, partesDoRascunho, pendencias, progresso,
  reativarItem, validarMedidor,
} from './domain/regras';
import {
  apagarArquivos, carregarRascunho, chaveArquivo, descartarRascunho, salvarArquivo, salvarPendente, salvarRascunho,
} from './data/armazenamentoLocal';
import { enviador } from './data/filaEnvio';
import { useAuth } from '../../contexts/AuthContext';
import { processarFoto } from './data/fotoProcessamento';
import { listarMotoristasChecklist } from './data/checklistFirestore';
import AssinaturaDialog from './components/AssinaturaDialog';
import ItemCard from './components/ItemCard';
import MedidorCampo from './components/MedidorCampo';
import MotoristaCampo from './components/MotoristaCampo';

const ATRASO_SALVAR_MS = 400;
const TITULO_PARTE = Object.fromEntries(PARTES.map((p) => [p.id, p.titulo])) as Record<ParteId, string>;
const botaoGrande = { minHeight: 52, fontSize: 16, fontWeight: 700, textTransform: 'none' } as const;

/** /checklist/itens: preenchimento em páginas, "Dados" e uma por parte, salvando no aparelho a cada mudança. */
export default function ChecklistItensPage() {
  const navigate = useNavigate();
  const { currentUser, authorizationProfile } = useAuth();
  const [rascunho, setRascunho] = useState<ChecklistRascunho | null>(null);
  const [motoristas, setMotoristas] = useState<ChecklistMotorista[]>([]);
  const [pagina, setPagina] = useState(0);
  const [mostrarPendencias, setMostrarPendencias] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [assinando, setAssinando] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const [processando, setProcessando] = useState<ReadonlySet<string>>(new Set());
  const pendenteSalvar = useRef<ChecklistRascunho | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // Depois de concluído, o rascunho saiu do aparelho: nada mais pode gravá-lo de novo.
  const concluido = useRef(false);

  const salvarAgora = useCallback(() => {
    window.clearTimeout(timer.current);
    if (concluido.current) return;
    const atual = pendenteSalvar.current;
    pendenteSalvar.current = null;
    if (atual) salvarRascunho(atual).catch((error) => console.error('Checklist: falha ao salvar o rascunho', error));
  }, []);

  useEffect(() => {
    let ativo = true;
    carregarRascunho()
      .then((r) => {
        if (!ativo) return;
        if (r) setRascunho(r);
        else navigate('/checklist', { replace: true });
      })
      .catch((error) => {
        console.error('Checklist: falha ao abrir o rascunho', error);
        if (ativo) navigate('/checklist', { replace: true });
      });
    // Sem conexão: o nome pode ser digitado.
    listarMotoristasChecklist().then((lista) => { if (ativo) setMotoristas(lista); }).catch((error) => console.warn('Checklist: sem a lista de motoristas', error));
    return () => { ativo = false; };
  }, [navigate]);

  // Salva antes de sair da tela, fechar o app ou ir para outro aplicativo.
  useEffect(() => {
    const aoEsconder = () => { if (document.visibilityState === 'hidden') salvarAgora(); };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', salvarAgora);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', salvarAgora);
      salvarAgora();
    };
  }, [salvarAgora]);

  const alterar = useCallback((mudar: (r: ChecklistRascunho) => ChecklistRascunho) => {
    setRascunho((atual) => {
      if (!atual) return atual;
      const novo = mudar(atual);
      pendenteSalvar.current = novo;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(salvarAgora, ATRASO_SALVAR_MS);
      return novo;
    });
  }, [salvarAgora]);

  const definirStatus = useCallback((itemId: string, status: ChecklistStatus) =>
    alterar((r) => comResposta(r, itemId, { ...respostaDe(r, itemId), status })), [alterar]);
  const definirObservacao = useCallback((itemId: string, observacao: string) =>
    alterar((r) => comResposta(r, itemId, { ...respostaDe(r, itemId), observacao })), [alterar]);

  const rascunhoId = rascunho?.id;

  /** Foto da câmera (hora do aparelho) ou da galeria (data do EXIF), processada e guardada antes de entrar no item. */
  const adicionarFoto = useCallback(async (itemId: string, arquivo: File, origem: OrigemFoto) => {
    if (!rascunhoId) return;
    setProcessando((atual) => new Set(atual).add(itemId));
    try {
      const capturadaEm = origem === 'camera'
        ? new Date()
        : dataOriginalDaFoto(new Uint8Array(await arquivo.slice(0, 256 * 1024).arrayBuffer()));
      const processada = await processarFoto(arquivo, textoCarimbo(origem, capturadaEm));
      const nome = `${itemId}_${Date.now()}`;
      const foto: ChecklistFoto = {
        arquivo: chaveArquivo(rascunhoId, `${nome}.jpg`),
        miniatura: chaveArquivo(rascunhoId, `${nome}_min.jpg`),
        origem,
        capturadaEm,
        bytes: processada.foto.size,
        largura: processada.largura,
        altura: processada.altura,
      };
      await salvarArquivo(foto.arquivo, processada.foto);
      await salvarArquivo(foto.miniatura, processada.miniatura);
      alterar((r) => {
        const atual = respostaDe(r, itemId);
        return comResposta(r, itemId, { ...atual, fotos: [...atual.fotos, foto] });
      });
    } catch (error) {
      console.error('Checklist: falha ao usar a foto', error);
      setAviso('Não foi possível usar essa foto. Tente de novo.');
    } finally {
      setProcessando((atual) => {
        const novo = new Set(atual);
        novo.delete(itemId);
        return novo;
      });
    }
  }, [alterar, rascunhoId]);

  const removerFoto = useCallback((itemId: string, foto: ChecklistFoto) => {
    alterar((r) => {
      const atual = respostaDe(r, itemId);
      return comResposta(r, itemId, { ...atual, fotos: atual.fotos.filter((f) => f.arquivo !== foto.arquivo) });
    });
    apagarArquivos([foto.arquivo, foto.miniatura]).catch((error) => console.warn('Checklist: falha ao apagar a foto', error));
  }, [alterar]);

  const lista = useMemo(() => (rascunho ? pendencias(rascunho) : []), [rascunho]);
  const itensComPendencia = useMemo(
    () => (mostrarPendencias ? new Set(lista.flatMap((p) => (p.itemId ? [p.itemId] : []))) : new Set<string>()),
    [lista, mostrarPendencias],
  );

  if (!rascunho) return <Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack>;

  const partes = partesDoRascunho(rascunho);
  const total = partes.length + 1;
  const atual = Math.min(pagina, total - 1);
  const ultima = atual === total - 1;
  const itens = itensDoRascunho(rascunho);
  const irPara = (indice: number) => {
    setPagina(indice);
    window.scrollTo({ top: 0 });
  };

  const concluir = () => {
    setMostrarPendencias(true);
    if (lista.length > 0) {
      setAviso(lista.length === 1 ? 'Falta 1 pendência, destacada na página.' : `Faltam ${lista.length} pendências, destacadas nas páginas.`);
      const destino = paginaDaPrimeiraPendencia(rascunho);
      if (destino != null) irPara(destino);
      return;
    }
    // A assinatura do motorista é o último passo e a confirmação.
    setAssinando(true);
  };

  /** Com a assinatura, o checklist vai para a fila de envio e não muda mais; o envio continua em seguida. */
  const assinou = async (assinatura: ChecklistAssinatura) => {
    if (!currentUser) return;
    setConcluindo(true);
    window.clearTimeout(timer.current);
    pendenteSalvar.current = null;
    const final: ChecklistRascunho = { ...rascunho, assinatura };
    try {
      await salvarRascunho(final);
      await salvarPendente({
        rascunho: final,
        autor: { uid: currentUser.uid, nome: authorizationProfile?.nome || currentUser.displayName || currentUser.email || '' },
        concluidoEm: new Date(),
        enviados: [],
        tentativas: 0,
        proximaTentativa: null,
      });
      concluido.current = true;
      await descartarRascunho({ apagarArquivos: false });
      void enviador.enviarPendentes({ forcar: true });
      navigate('/checklist', { replace: true, state: { aviso: 'Checklist concluído. O envio continua em seguida.' } });
    } catch (error) {
      console.error('Checklist: falha ao concluir', error);
      setRascunho(final);
      setAssinando(false);
      setConcluindo(false);
      setAviso('Não foi possível concluir. Tente de novo.');
    }
  };

  const pendenciaDados = mostrarPendencias && lista.some((p) => p.itemId == null);

  return (
    <Box sx={{ pb: 'calc(88px + env(safe-area-inset-bottom))' }}>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Typography fontWeight={800} sx={{ px: 2, pt: 1.5 }}>
          {rascunho.veiculo.identificador} · {rascunho.tipo === 'saida' ? 'Saída' : 'Chegada'}
        </Typography>
        <Tabs value={atual} onChange={(_, v: number) => irPara(v)} variant="scrollable" scrollButtons={false} sx={{ px: 1 }}>
          <Tab
            label="Dados"
            icon={pendenciaDados ? <ErrorOutlineRoundedIcon color="error" fontSize="small" /> : undefined}
            iconPosition="start"
            sx={{ minHeight: 48, textTransform: 'none' }}
          />
          {partes.map((parte) => {
            const daParte = itens.filter((i) => i.parte === parte);
            const respondidos = daParte.filter((i) => respostaDe(rascunho, i.id).status != null).length;
            const comPendencia = daParte.some((i) => itensComPendencia.has(i.id));
            const feita = respondidos === daParte.length && !comPendencia;
            return (
              <Tab
                key={parte}
                label={`${TITULO_PARTE[parte]} ${respondidos}/${daParte.length}`}
                icon={comPendencia ? <ErrorOutlineRoundedIcon color="error" fontSize="small" /> : feita ? <CheckRoundedIcon fontSize="small" /> : undefined}
                iconPosition="start"
                sx={{ minHeight: 48, textTransform: 'none' }}
              />
            );
          })}
        </Tabs>
      </Box>

      <Box sx={{ maxWidth: 640, mx: 'auto', px: 1.5, py: 1.5 }}>
        {atual === 0
          ? <PaginaDados rascunho={rascunho} motoristas={motoristas} mostrarPendencias={mostrarPendencias} alterar={alterar} />
          : (
            <PaginaParte
              parte={partes[atual - 1]}
              rascunho={rascunho}
              itensComPendencia={itensComPendencia}
              processando={processando}
              onStatus={definirStatus}
              onObservacao={definirObservacao}
              onAdicionarFoto={(itemId, arquivo, origem) => void adicionarFoto(itemId, arquivo, origem)}
              onRemoverFoto={removerFoto}
              onReativar={(itemId) => alterar((r) => reativarItem(r, itemId))}
            />
          )}
      </Box>

      <Box sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 3, bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider', p: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 640, mx: 'auto' }}>
          <Button fullWidth variant="outlined" size="large" sx={botaoGrande} disabled={atual === 0} onClick={() => irPara(atual - 1)} startIcon={<ChevronLeftRoundedIcon />}>
            Anterior
          </Button>
          {ultima
            ? <Button fullWidth variant="contained" size="large" sx={botaoGrande} disabled={concluindo} onClick={concluir}>Concluir checklist</Button>
            : <Button fullWidth variant="contained" size="large" sx={botaoGrande} onClick={() => irPara(atual + 1)} endIcon={<ChevronRightRoundedIcon />}>Próxima</Button>}
        </Stack>
      </Box>

      <Snackbar open={aviso != null} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} />
      {assinando && <AssinaturaDialog rascunho={rascunho} onFechar={() => setAssinando(false)} onConcluir={(a) => void assinou(a)} />}
    </Box>
  );
}

function PaginaDados({ rascunho, motoristas, mostrarPendencias, alterar }: {
  rascunho: ChecklistRascunho;
  motoristas: ChecklistMotorista[];
  mostrarPendencias: boolean;
  alterar: (mudar: (r: ChecklistRascunho) => ChecklistRascunho) => void;
}) {
  const { veiculo } = rascunho;
  const catalogo = catalogoDoRascunho(rascunho);
  const horimetro = usaHorimetro(catalogo);
  const p = progresso(rascunho);
  const erroMedidor = mostrarPendencias
    ? validarMedidor(rascunho.medidor, { ultimo: veiculo.medidorUltimo, horimetro, corrigido: rascunho.medidorCorrigido })
    : null;
  const erroMotorista = mostrarPendencias && (rascunho.motorista?.nome.trim() ?? '') === '' ? 'Informe o motorista/operador.' : null;
  return (
    <Stack spacing={2}>
      <Card variant="outlined">
        <CardContent>
          <Stack spacing={2.5}>
            <Typography>{veiculo.nome || veiculo.identificador} · {CATALOGOS[catalogo].titulo}</Typography>
            <MotoristaCampo
              key={motoristas.length}
              motoristas={motoristas}
              valor={rascunho.motorista}
              onChange={(motorista) => alterar((r) => ({ ...r, motorista }))}
              erro={erroMotorista}
            />
            <MedidorCampo
              horimetro={horimetro}
              ultimo={veiculo.medidorUltimo}
              texto={rascunho.medidor == null ? '' : String(rascunho.medidor)}
              onTexto={(t) => alterar((r) => comMedidor(r, t === '' ? null : Number(t)))}
              corrigido={rascunho.medidorCorrigido}
              onCorrigido={(medidorCorrigido) => alterar((r) => ({ ...r, medidorCorrigido }))}
              erro={erroMedidor}
            />
            <FormControlLabel
              control={<Switch checked={rascunho.guincho} onChange={(e) => alterar((r) => ({ ...r, guincho: e.target.checked }))} />}
              label="Com guincho"
              labelPlacement="start"
              sx={{ justifyContent: 'space-between', ml: 0 }}
            />
          </Stack>
        </CardContent>
      </Card>
      <Box>
        <LinearProgress variant="determinate" value={p.total === 0 ? 0 : (100 * p.respondidos) / p.total} />
        <Typography variant="body2" sx={{ mt: 0.5 }}>{p.respondidos} de {p.total} itens respondidos</Typography>
      </Box>
      {mostrarPendencias && pendencias(rascunho).length === 0 && <Alert severity="success">Nenhuma pendência.</Alert>}
    </Stack>
  );
}

function PaginaParte({ parte, rascunho, itensComPendencia, processando, onStatus, onObservacao, onAdicionarFoto, onRemoverFoto, onReativar }: {
  parte: ParteId;
  rascunho: ChecklistRascunho;
  itensComPendencia: Set<string>;
  processando: ReadonlySet<string>;
  onStatus: (itemId: string, status: ChecklistStatus) => void;
  onObservacao: (itemId: string, texto: string) => void;
  onAdicionarFoto: (itemId: string, arquivo: File, origem: OrigemFoto) => void;
  onRemoverFoto: (itemId: string, foto: ChecklistFoto) => void;
  onReativar: (itemId: string) => void;
}) {
  const ativos = itensAtivos(rascunho).filter((i) => i.parte === parte);
  const naoSeAplica = itensNaoSeAplica(rascunho).filter((i) => i.parte === parte);
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" fontWeight={800}>{TITULO_PARTE[parte]}</Typography>
      {ativos.length === 0 && <Typography sx={{ py: 3 }}>Todos os itens desta parte estão em "Não se aplica".</Typography>}
      {ativos.map((item) => (
        <ItemCard
          key={item.id}
          item={item}
          resposta={respostaDe(rascunho, item.id)}
          destacarPendencia={itensComPendencia.has(item.id)}
          processandoFoto={processando.has(item.id)}
          onStatus={onStatus}
          onObservacao={onObservacao}
          onAdicionarFoto={onAdicionarFoto}
          onRemoverFoto={onRemoverFoto}
        />
      ))}
      {naoSeAplica.length > 0 && (
        <Accordion key={parte} disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
            <Box>
              <Typography fontWeight={700}>Não se aplica ({naoSeAplica.length})</Typography>
              <Typography variant="body2" color="text.secondary">Toque em Reativar para voltar à lista</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ p: 0 }}>
            {naoSeAplica.map((item) => (
              <Stack key={item.id} direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography>{item.titulo}</Typography>
                <Button onClick={() => onReativar(item.id)} sx={{ minHeight: 44 }}>Reativar</Button>
              </Stack>
            ))}
          </AccordionDetails>
        </Accordion>
      )}
    </Stack>
  );
}
