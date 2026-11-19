import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ArrowUpRight, Brush, Circle, GripVertical, Highlighter, Minus, Redo2, Square, Trash2, Undo2, X } from 'lucide-react';

// Canvas (Ferramentas, só adm2): uma camada sobre a tela inteira para desenhar ao revisar uma tela com a equipe ou numa
// apresentação, como o Lightshot: pincel livre, marca-texto, linha, seta, retângulo e elipse, com cor e espessura.
// O desenho fica só nesta camada (nada é salvo) e some ao fechar. Atalhos: Ctrl+Z desfaz, Ctrl+Y ou Ctrl+Shift+Z refaz,
// Esc fecha. A barra de ferramentas se arrasta pela alça.

type Ponto = { x: number; y: number };
type Ferramenta = 'pincel' | 'marcador' | 'linha' | 'seta' | 'retangulo' | 'elipse';
type Traco = { ferramenta: Ferramenta; cor: string; espessura: number; pontos: Ponto[] };

const FERRAMENTAS: { id: Ferramenta; rotulo: string; icone: React.ReactNode }[] = [
  { id: 'pincel', rotulo: 'Pincel livre', icone: <Brush size={18} /> },
  { id: 'marcador', rotulo: 'Marca-texto', icone: <Highlighter size={18} /> },
  { id: 'linha', rotulo: 'Linha', icone: <Minus size={18} /> },
  { id: 'seta', rotulo: 'Seta', icone: <ArrowUpRight size={18} /> },
  { id: 'retangulo', rotulo: 'Retângulo', icone: <Square size={18} /> },
  { id: 'elipse', rotulo: 'Elipse', icone: <Circle size={18} /> },
];
const CORES = [
  { cor: '#E53935', nome: 'Vermelho' },
  { cor: '#FDD835', nome: 'Amarelo' },
  { cor: '#2E9D6F', nome: 'Verde' },
  { cor: '#1E88E5', nome: 'Azul' },
  { cor: '#000000', nome: 'Preto' },
  { cor: '#FFFFFF', nome: 'Branco' },
];
const ESPESSURAS = [3, 6, 12];

function desenhar(ctx: CanvasRenderingContext2D, t: Traco) {
  const [a] = t.pontos;
  const b = t.pontos[t.pontos.length - 1];
  if (!a) return;
  ctx.save();
  ctx.strokeStyle = t.cor;
  ctx.fillStyle = t.cor;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = t.ferramenta === 'marcador' ? t.espessura * 3 : t.espessura;
  if (t.ferramenta === 'marcador') { ctx.globalAlpha = 0.35; ctx.lineCap = 'butt'; }
  ctx.beginPath();
  switch (t.ferramenta) {
    case 'pincel':
    case 'marcador':
      ctx.moveTo(a.x, a.y);
      if (t.pontos.length === 1) ctx.lineTo(a.x + 0.01, a.y);
      // Curvas pelos pontos médios: o traço sai liso mesmo com o mouse rápido.
      for (let i = 1; i < t.pontos.length - 1; i++) {
        const p = t.pontos[i], q = t.pontos[i + 1];
        ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
      }
      if (t.pontos.length > 1) ctx.lineTo(b.x, b.y);
      ctx.stroke();
      break;
    case 'linha':
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      break;
    case 'seta': {
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const ponta = Math.max(12, t.espessura * 3.5);
      // A haste para na base da ponta, para a ponta ficar afiada com traço grosso.
      const base = { x: b.x - Math.cos(ang) * ponta * 0.8, y: b.y - Math.sin(ang) * ponta * 0.8 };
      ctx.moveTo(a.x, a.y); ctx.lineTo(base.x, base.y); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - ponta * Math.cos(ang - Math.PI / 7), b.y - ponta * Math.sin(ang - Math.PI / 7));
      ctx.lineTo(b.x - ponta * Math.cos(ang + Math.PI / 7), b.y - ponta * Math.sin(ang + Math.PI / 7));
      ctx.closePath(); ctx.fill();
      break;
    }
    case 'retangulo':
      ctx.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      break;
    case 'elipse':
      ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
  }
  ctx.restore();
}

export default function CanvasTela({ onFechar }: { onFechar: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tracos, setTracos] = useState<Traco[]>([]);
  const [desfeitos, setDesfeitos] = useState<Traco[]>([]);
  const atual = useRef<Traco | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>('pincel');
  const [cor, setCor] = useState(CORES[0].cor);
  const [espessura, setEspessura] = useState(ESPESSURAS[1]);
  const [barra, setBarra] = useState<Ponto>(() => ({ x: Math.max(16, window.innerWidth / 2 - 330), y: 16 }));
  const arrasto = useRef<Ponto | null>(null);

  const redesenhar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tracos.forEach(t => desenhar(ctx, t));
    if (atual.current) desenhar(ctx, atual.current);
  }, [tracos]);

  // Canvas do tamanho da janela, na resolução da tela (nítido em monitor de alta densidade).
  useEffect(() => {
    const ajustar = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
      redesenhar();
    };
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [redesenhar]);

  const desfazer = useCallback(() => {
    setTracos(lista => {
      if (!lista.length) return lista;
      setDesfeitos(d => [...d, lista[lista.length - 1]]);
      return lista.slice(0, -1);
    });
  }, []);
  const refazer = useCallback(() => {
    setDesfeitos(d => {
      if (!d.length) return d;
      setTracos(lista => [...lista, d[d.length - 1]]);
      return d.slice(0, -1);
    });
  }, []);
  const limpar = () => { setTracos([]); setDesfeitos([]); };

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); return; }
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refazer(); }
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  }, [onFechar, desfazer, refazer]);

  const ponto = (e: ReactPointerEvent) => ({ x: e.clientX, y: e.clientY });
  const iniciar = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    atual.current = { ferramenta, cor, espessura, pontos: [ponto(e)] };
    redesenhar();
  };
  const mover = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const t = atual.current;
    if (!t) return;
    if (t.ferramenta === 'pincel' || t.ferramenta === 'marcador') t.pontos.push(ponto(e));
    else t.pontos = [t.pontos[0], ponto(e)];
    redesenhar();
  };
  const terminar = () => {
    const t = atual.current;
    atual.current = null;
    if (!t) return;
    const [a] = t.pontos, b = t.pontos[t.pontos.length - 1];
    // Uma forma sem arrasto (só um clique) não vira traço; o pincel deixa o ponto.
    const livre = t.ferramenta === 'pincel' || t.ferramenta === 'marcador';
    if (!livre && Math.hypot(b.x - a.x, b.y - a.y) < 3) { redesenhar(); return; }
    setTracos(lista => [...lista, t]);
    setDesfeitos([]);
  };

  const pegarBarra = (e: ReactPointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrasto.current = { x: e.clientX - barra.x, y: e.clientY - barra.y };
  };
  const arrastarBarra = (e: ReactPointerEvent<HTMLElement>) => {
    if (!arrasto.current) return;
    setBarra({
      x: Math.min(Math.max(0, e.clientX - arrasto.current.x), window.innerWidth - 60),
      y: Math.min(Math.max(0, e.clientY - arrasto.current.y), window.innerHeight - 40),
    });
  };

  const botao = (ativo: boolean) => ({
    width: 34, height: 34, borderRadius: '8px', color: '#fff',
    bgcolor: ativo ? 'rgb(255 255 255 / 0.22)' : 'transparent',
    '&:hover': { bgcolor: ativo ? 'rgb(255 255 255 / 0.28)' : 'rgb(255 255 255 / 0.12)' },
    '&.Mui-disabled': { color: 'rgb(255 255 255 / 0.3)' },
  });
  const separador = <Box sx={{ width: '1px', alignSelf: 'stretch', my: 0.5, bgcolor: 'rgb(255 255 255 / 0.18)' }} />;
  const dicaSx = { slotProps: { popper: { sx: { zIndex: 2101 } } } };

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      <Box
        component="canvas"
        ref={canvasRef}
        aria-label="Área de desenho"
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none', boxShadow: 'inset 0 0 0 3px #E79A25' }}
      />
      <Box
        role="toolbar"
        aria-label="Ferramentas do Canvas"
        sx={{
          position: 'absolute', left: barra.x, top: barra.y, zIndex: 2100, display: 'flex', alignItems: 'center', gap: 0.5,
          flexWrap: 'wrap', maxWidth: 'calc(100vw - 16px)', p: 0.75, borderRadius: '12px', bgcolor: 'primary.main',
          color: '#fff', boxShadow: '0 8px 24px rgb(0 0 0 / 0.3)', userSelect: 'none',
        }}
      >
        <Tooltip title="Arrastar a barra" {...dicaSx}>
          <Box
            onPointerDown={pegarBarra}
            onPointerMove={arrastarBarra}
            onPointerUp={() => { arrasto.current = null; }}
            sx={{ display: 'grid', placeItems: 'center', width: 20, height: 34, cursor: 'grab', color: 'rgb(255 255 255 / 0.6)', touchAction: 'none' }}
          >
            <GripVertical size={18} />
          </Box>
        </Tooltip>
        {FERRAMENTAS.map(f => (
          <Tooltip key={f.id} title={f.rotulo} {...dicaSx}>
            <IconButton aria-label={f.rotulo} aria-pressed={ferramenta === f.id} onClick={() => setFerramenta(f.id)} sx={botao(ferramenta === f.id)}>
              {f.icone}
            </IconButton>
          </Tooltip>
        ))}
        {separador}
        {CORES.map(c => (
          <Tooltip key={c.cor} title={c.nome} {...dicaSx}>
            <IconButton aria-label={`Cor ${c.nome}`} aria-pressed={cor === c.cor} onClick={() => setCor(c.cor)} sx={{ ...botao(cor === c.cor), width: 30 }}>
              <Box component="span" sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: c.cor, border: '2px solid rgb(255 255 255 / 0.85)' }} />
            </IconButton>
          </Tooltip>
        ))}
        {separador}
        {ESPESSURAS.map((px, i) => {
          const nome = ['Fina', 'Média', 'Grossa'][i];
          return (
            <Tooltip key={px} title={`Espessura ${nome.toLowerCase()}`} {...dicaSx}>
              <IconButton aria-label={`Espessura ${nome}`} aria-pressed={espessura === px} onClick={() => setEspessura(px)} sx={{ ...botao(espessura === px), width: 30 }}>
                <Box component="span" sx={{ width: px + 2, height: px + 2, borderRadius: '50%', bgcolor: '#fff' }} />
              </IconButton>
            </Tooltip>
          );
        })}
        {separador}
        <Tooltip title="Desfazer (Ctrl+Z)" {...dicaSx}>
          <span><IconButton aria-label="Desfazer" disabled={!tracos.length} onClick={desfazer} sx={botao(false)}><Undo2 size={18} /></IconButton></span>
        </Tooltip>
        <Tooltip title="Refazer (Ctrl+Y)" {...dicaSx}>
          <span><IconButton aria-label="Refazer" disabled={!desfeitos.length} onClick={refazer} sx={botao(false)}><Redo2 size={18} /></IconButton></span>
        </Tooltip>
        <Tooltip title="Limpar tudo" {...dicaSx}>
          <span><IconButton aria-label="Limpar tudo" disabled={!tracos.length} onClick={limpar} sx={botao(false)}><Trash2 size={18} /></IconButton></span>
        </Tooltip>
        {separador}
        <Tooltip title="Fechar o Canvas (Esc)" {...dicaSx}>
          <IconButton aria-label="Fechar o Canvas" onClick={onFechar} sx={botao(false)}><X size={18} /></IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
}
