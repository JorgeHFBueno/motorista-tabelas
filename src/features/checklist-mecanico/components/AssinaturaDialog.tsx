import {
  Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Stack, TextField,
  Typography,
} from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ScreenRotationRoundedIcon from '@mui/icons-material/ScreenRotationRounded';
import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { chaveArquivo, salvarArquivo } from '../data/armazenamentoLocal';
import { desenharAssinatura } from '../data/fotoProcessamento';
import { COMPRIMENTO_MINIMO_ASSINATURA, comprimentoDosTracos, type Ponto } from '../domain/foto';
import type { ChecklistAssinatura, ChecklistRascunho } from '../domain/rascunho';
import { totais } from '../domain/regras';

/** O iPhone não deixa o site travar a orientação: na vertical, a tela pede para girar o celular. */
function useVertical(): boolean {
  const consulta = '(orientation: portrait)';
  const [vertical, setVertical] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const mudou = () => setVertical(mq.matches);
    mq.addEventListener('change', mudou);
    return () => mq.removeEventListener('change', mudou);
  }, []);
  return vertical;
}

/**
 * Último passo do checklist: o motorista assina num quadro branco, com o celular na horizontal. Devolve a assinatura,
 * ou "motorista ausente" com o motivo; "Voltar ao checklist" fecha sem concluir.
 */
export default function AssinaturaDialog({ rascunho, onFechar, onConcluir }: {
  rascunho: ChecklistRascunho;
  onFechar: () => void;
  onConcluir: (assinatura: ChecklistAssinatura) => void;
}) {
  const vertical = useVertical();
  const caixa = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tracos = useRef<Ponto[][]>([]);
  const desenhando = useRef(false);
  const [temTraco, setTemTraco] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [motivoAberto, setMotivoAberto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const t = totais(rascunho);

  const redesenhar = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const largura = c.width / dpr;
    const altura = c.height / dpr;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.strokeStyle = 'rgb(0 0 0 / 0.26)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, altura * 0.75);
    ctx.lineTo(largura - 24, altura * 0.75);
    ctx.stroke();
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const traco of tracos.current) {
      if (traco.length === 1) {
        ctx.beginPath();
        ctx.arc(traco[0].x, traco[0].y, 1.5, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      traco.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
  }, []);

  // O quadro ocupa o espaço livre; ao mudar de tamanho (girar o celular), ajusta o canvas e redesenha.
  useEffect(() => {
    const el = caixa.current;
    if (!el) return undefined;
    const ajustar = () => {
      const c = canvas.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.max(1, Math.round(el.clientWidth * dpr));
      c.height = Math.max(1, Math.round(el.clientHeight * dpr));
      redesenhar();
    };
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(el);
    return () => observador.disconnect();
  }, [redesenhar, vertical]);

  const ponto = (e: PointerEvent<HTMLCanvasElement>): Ponto => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(r.width, Math.max(0, e.clientX - r.left)), y: Math.min(r.height, Math.max(0, e.clientY - r.top)) };
  };

  const area = () => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    return { largura: c.width / dpr, altura: c.height / dpr };
  };

  const concluir = async () => {
    if (comprimentoDosTracos(tracos.current) < COMPRIMENTO_MINIMO_ASSINATURA) {
      setAviso('Peça para o motorista assinar no quadro branco.');
      return;
    }
    setGravando(true);
    try {
      const desenho = await desenharAssinatura(tracos.current, area());
      const chave = chaveArquivo(rascunho.id, 'assinatura.jpg');
      await salvarArquivo(chave, desenho.jpeg);
      onConcluir({ ausente: false, arquivo: chave, em: new Date(), bytes: desenho.jpeg.size, largura: desenho.largura, altura: desenho.altura });
    } catch (error) {
      console.error('Checklist: falha ao gravar a assinatura', error);
      setGravando(false);
      setAviso('Não foi possível gravar a assinatura. Tente de novo.');
    }
  };

  const limpar = () => {
    tracos.current = [];
    setTemTraco(false);
    redesenhar();
  };

  const botoesSecundarios = (
    <>
      <Button disabled={gravando} onClick={() => setMotivoAberto(true)} sx={{ minHeight: 44 }}>Motorista ausente</Button>
      <Button disabled={gravando} onClick={onFechar} sx={{ minHeight: 44 }}>Voltar ao checklist</Button>
    </>
  );

  return (
    <Dialog open fullScreen onClose={gravando ? undefined : onFechar}>
      <Box sx={{ display: 'flex', height: '100%', gap: 1.5, p: 1.5, pl: 'max(12px, env(safe-area-inset-left))', pr: 'max(12px, env(safe-area-inset-right))', bgcolor: 'background.default' }}>
        <Stack sx={{ flex: 1, minWidth: 0 }} spacing={1}>
          <Typography fontWeight={700}>Assinatura de {rascunho.motorista?.nome || 'motorista'}</Typography>
          <Box ref={caixa} sx={{ flex: 1, position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: '#fff', border: 1, borderColor: 'divider' }}>
            <canvas
              ref={canvas}
              aria-label="Quadro da assinatura"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
              onPointerDown={(e) => {
                if (gravando) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                desenhando.current = true;
                tracos.current.push([ponto(e)]);
                setTemTraco(true);
                redesenhar();
              }}
              onPointerMove={(e) => {
                if (!desenhando.current) return;
                tracos.current[tracos.current.length - 1].push(ponto(e));
                redesenhar();
              }}
              onPointerUp={() => { desenhando.current = false; }}
              onPointerCancel={() => { desenhando.current = false; }}
            />
          </Box>
        </Stack>
        {!vertical && (
          <Stack sx={{ width: 220, flex: '0 0 220px', overflowY: 'auto' }} spacing={1}>
            <Typography fontWeight={700}>{rascunho.veiculo.identificador} · {rascunho.tipo === 'saida' ? 'Saída' : 'Chegada'}</Typography>
            <Typography variant="body2">OK: {t.ok} · Avaria: {t.avaria} · N/A: {t.nao_se_aplica}</Typography>
            <Typography variant="caption" color="text.secondary">Depois de concluído, o checklist não pode ser alterado.</Typography>
            <Button variant="contained" size="large" disabled={gravando} onClick={() => void concluir()} startIcon={gravando ? <CircularProgress size={18} color="inherit" /> : <CheckRoundedIcon />} sx={{ minHeight: 48, fontWeight: 700 }}>
              Concluir
            </Button>
            <Button variant="outlined" disabled={gravando || !temTraco} onClick={limpar} startIcon={<RefreshRoundedIcon />} sx={{ minHeight: 44 }}>Limpar</Button>
            {botoesSecundarios}
          </Stack>
        )}
      </Box>
      {vertical && (
        <Stack alignItems="center" justifyContent="center" spacing={2} sx={{ position: 'absolute', inset: 0, bgcolor: 'background.default', p: 3, textAlign: 'center', zIndex: 1 }}>
          <ScreenRotationRoundedIcon sx={{ fontSize: 64 }} color="primary" />
          <Typography variant="h6" fontWeight={800}>Gire o celular para a horizontal</Typography>
          <Typography color="text.secondary">A assinatura do motorista é feita com o celular deitado.</Typography>
          {botoesSecundarios}
        </Stack>
      )}
      <Dialog open={motivoAberto} onClose={() => setMotivoAberto(false)} fullWidth>
        <DialogTitle>Motorista ausente</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth multiline minRows={2} label="Por que não há assinatura?" value={motivo} onChange={(e) => setMotivo(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMotivoAberto(false)}>Cancelar</Button>
          <Button variant="contained" disabled={motivo.trim() === ''} onClick={() => onConcluir({ ausente: true, motivo: motivo.trim(), em: new Date() })}>
            Concluir sem assinatura
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={aviso != null} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} anchorOrigin={{ vertical: 'top', horizontal: 'center' }} />
    </Dialog>
  );
}
