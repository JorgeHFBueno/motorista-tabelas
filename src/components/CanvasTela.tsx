import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ArrowUpRight, Brush, Circle, Copy, GripVertical, Highlighter, ImageUp, Minus, Pin, Redo2, Square, Trash2, Type, Undo2, X } from 'lucide-react';
import { mandarImagemParaAprovacao, temQuemRecebaImagem } from '../features/erp/imagemParaAprovacao';

// Canvas (Ferramentas, só adm2): uma camada sobre a tela inteira para desenhar ao revisar uma tela com a equipe ou numa
// apresentação, como o Lightshot: pincel livre, marca-texto, linha, seta, retângulo, elipse e texto, com cor e espessura.
// A roda do mouse continua rolando a página por baixo. "Fixar na página" prende cada desenho ao que rola sob ele (a
// página ou a caixa com rolagem, como uma tabela), em vez de ficar parado na tela. "Copiar a tela" captura a aba
// (o navegador pede para compartilhar a aba) e põe a imagem, com o desenho, na área de transferência; se o navegador
// recusar, baixa o PNG. Nada é salvo: o desenho some ao fechar. Atalhos: Ctrl+Z desfaz, Ctrl+Y ou Ctrl+Shift+Z refaz,
// Ctrl+C copia a tela, Esc fecha. No texto, Enter confirma, Shift+Enter quebra a linha e Esc desiste. Nas telas do ERP, para
// quem aprova páginas, "Mandar para Aprovar página" (2026-11-26) captura a tela do mesmo jeito, entrega a imagem à caixa
// Aprovar página (features/erp/imagemParaAprovacao.ts) e fecha o Canvas.

type Ponto = { x: number; y: number };
type Ferramenta = 'pincel' | 'marcador' | 'linha' | 'seta' | 'retangulo' | 'elipse' | 'texto';
/** Onde o desenho foi preso: a caixa com rolagem sob ele (null = a página) e as rolagens no momento. */
type Ancora = { el: Element | null; sx: number; sy: number; wx: number; wy: number };
type Traco = { ferramenta: Ferramenta; cor: string; espessura: number; pontos: Ponto[]; texto?: string; ancora?: Ancora };
type Editor = { x: number; y: number; texto: string; ancora?: Ancora };

const FERRAMENTAS: { id: Ferramenta; rotulo: string; icone: React.ReactNode }[] = [
  { id: 'pincel', rotulo: 'Pincel livre', icone: <Brush size={18} /> },
  { id: 'marcador', rotulo: 'Marca-texto', icone: <Highlighter size={18} /> },
  { id: 'linha', rotulo: 'Linha', icone: <Minus size={18} /> },
  { id: 'seta', rotulo: 'Seta', icone: <ArrowUpRight size={18} /> },
  { id: 'retangulo', rotulo: 'Retângulo', icone: <Square size={18} /> },
  { id: 'elipse', rotulo: 'Elipse', icone: <Circle size={18} /> },
  { id: 'texto', rotulo: 'Texto', icone: <Type size={18} /> },
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
const TAMANHO_TEXTO: Record<number, number> = { 3: 16, 6: 24, 12: 36 };
const ALTURA_LINHA = 1.25;
const CHAVE_FIXAR = 'ledur:canvas-fixar';

const tamanhoTexto = (espessura: number) => TAMANHO_TEXTO[espessura] ?? 24;

function lerFixar() {
  try { return localStorage.getItem(CHAVE_FIXAR) === '1'; } catch { return false; }
}

/** A caixa com rolagem mais próxima de `el` (no eixo pedido, ou em qualquer um); null quando é a própria página. */
function caixaRolavel(el: Element | null, eixo?: 'x' | 'y'): Element | null {
  for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
    const s = getComputedStyle(e);
    const rolaY = /(auto|scroll|overlay)/.test(s.overflowY) && e.scrollHeight > e.clientHeight;
    const rolaX = /(auto|scroll|overlay)/.test(s.overflowX) && e.scrollWidth > e.clientWidth;
    if (eixo === 'y' ? rolaY : eixo === 'x' ? rolaX : rolaY || rolaX) return e;
  }
  return null;
}

/** O elemento da página sob o ponto, ignorando a própria camada do Canvas. */
function elementoSob(p: Ponto, camada: HTMLElement | null) {
  return document.elementsFromPoint(p.x, p.y).find(e => !camada?.contains(e)) ?? null;
}

function ancorar(p: Ponto, camada: HTMLElement | null): Ancora {
  const el = caixaRolavel(elementoSob(p, camada));
  return { el, sx: el?.scrollLeft ?? 0, sy: el?.scrollTop ?? 0, wx: window.scrollX, wy: window.scrollY };
}

/** Quanto a página (e a caixa) rolou desde que o desenho foi preso. */
function deslocamento(a: Ancora): Ponto {
  return {
    x: (a.el ? a.el.scrollLeft - a.sx : 0) + window.scrollX - a.wx,
    y: (a.el ? a.el.scrollTop - a.sy : 0) + window.scrollY - a.wy,
  };
}

function soltar(t: Traco): Traco {
  if (!t.ancora) return t;
  const d = deslocamento(t.ancora);
  return { ...t, ancora: undefined, pontos: t.pontos.map(p => ({ x: p.x - d.x, y: p.y - d.y })) };
}

function desenharForma(ctx: CanvasRenderingContext2D, t: Traco, fonte: string) {
  const [a] = t.pontos;
  const b = t.pontos[t.pontos.length - 1];
  if (!a) return;
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
    case 'texto': {
      const tam = tamanhoTexto(t.espessura);
      ctx.font = `600 ${tam}px ${fonte}`;
      ctx.textBaseline = 'middle';
      // Mesma linha do campo de digitação: o meio de cada linha de altura 1,25 × o tamanho.
      (t.texto ?? '').split('\n').forEach((linha, i) => ctx.fillText(linha, a.x, a.y + tam * ALTURA_LINHA * (i + 0.5)));
      break;
    }
  }
}

function desenhar(ctx: CanvasRenderingContext2D, t: Traco, fonte: string) {
  const el = t.ancora?.el;
  if (el && !el.isConnected) return;
  ctx.save();
  if (t.ancora) {
    // Preso numa caixa com rolagem: o que rolou para fora da caixa não aparece.
    if (el) {
      const r = el.getBoundingClientRect();
      ctx.beginPath();
      ctx.rect(r.left + el.clientLeft, r.top + el.clientTop, el.clientWidth, el.clientHeight);
      ctx.clip();
    }
    const d = deslocamento(t.ancora);
    ctx.translate(-d.x, -d.y);
  }
  desenharForma(ctx, t, fonte);
  ctx.restore();
}

export default function CanvasTela({ onFechar }: { onFechar: () => void }) {
  const camadaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tracos, setTracos] = useState<Traco[]>([]);
  const [desfeitos, setDesfeitos] = useState<Traco[]>([]);
  const atual = useRef<Traco | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>('pincel');
  const [cor, setCor] = useState(CORES[0].cor);
  const [espessura, setEspessura] = useState(ESPESSURAS[1]);
  const [fixar, setFixar] = useState(lerFixar);
  const [editor, setEditor] = useState<Editor | null>(null);
  const textoAberto = useRef(false);
  const [capturando, setCapturando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [barra, setBarra] = useState<Ponto>(() => ({ x: Math.max(16, window.innerWidth / 2 - 380), y: 16 }));
  const arrasto = useRef<Ponto | null>(null);
  const [fonte] = useState(() => getComputedStyle(document.body).fontFamily || 'sans-serif');

  const redesenhar = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    tracos.forEach(t => desenhar(ctx, t, fonte));
    if (atual.current) desenhar(ctx, atual.current, fonte);
  }, [tracos, fonte]);

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

  // Qualquer rolagem (da página ou de uma caixa) redesenha: os desenhos presos acompanham.
  useEffect(() => {
    let quadro = 0;
    const rolou = () => { cancelAnimationFrame(quadro); quadro = requestAnimationFrame(redesenhar); };
    document.addEventListener('scroll', rolou, { capture: true, passive: true });
    return () => { cancelAnimationFrame(quadro); document.removeEventListener('scroll', rolou, { capture: true }); };
  }, [redesenhar]);

  // A roda do mouse sobre a camada rola o que está por baixo dela (a página ou a caixa sob o ponteiro).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const vertical = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
      const alvo = caixaRolavel(elementoSob({ x: e.clientX, y: e.clientY }, camadaRef.current), vertical ? 'y' : 'x')
        ?? document.scrollingElement;
      const escala = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
      // Sem a rolagem suave da página (index.css): com ela, cada passo da roda recomeça a animação e a rolagem fica lenta.
      alvo?.scrollBy({ left: e.deltaX * escala, top: e.deltaY * escala, behavior: 'instant' });
    };
    canvas.addEventListener('wheel', roda, { passive: false });
    return () => canvas.removeEventListener('wheel', roda);
  }, []);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  const adicionar = (t: Traco) => { setTracos(lista => [...lista, t]); setDesfeitos([]); };

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

  const abrirTexto = (p: Ponto) => {
    textoAberto.current = true;
    setEditor({ ...p, texto: '', ancora: fixar ? ancorar(p, camadaRef.current) : undefined });
  };
  const confirmarTexto = () => {
    if (!textoAberto.current || !editor) return;
    textoAberto.current = false;
    if (editor.texto.trim()) adicionar({ ferramenta: 'texto', cor, espessura, pontos: [{ x: editor.x, y: editor.y }], texto: editor.texto, ancora: editor.ancora });
    setEditor(null);
  };
  const desistirTexto = () => { textoAberto.current = false; setEditor(null); };

  // Liga ou desliga para todos os desenhos: ao fixar, cada um fica preso onde está agora; ao soltar, fica parado na tela
  // na posição em que está.
  const alternarFixar = () => {
    const camada = camadaRef.current;
    const novo = !fixar;
    const trocar = (t: Traco) => (novo ? (t.ancora ? t : { ...t, ancora: ancorar(t.pontos[0], camada) }) : soltar(t));
    setTracos(lista => lista.map(trocar));
    setDesfeitos(lista => lista.map(trocar));
    setFixar(novo);
    try { localStorage.setItem(CHAVE_FIXAR, novo ? '1' : '0'); } catch { /* só a preferência deste navegador */ }
  };

  const [paraAprovacao] = useState(temQuemRecebaImagem);

  /** Captura a aba com o desenho (o navegador pede para compartilhar a aba); null se a pessoa cancelou ou falhou. */
  const capturarTela = async (): Promise<Blob | null> => {
    confirmarTexto();
    if (!navigator.mediaDevices?.getDisplayMedia) { setAviso('Este navegador não captura a tela.'); return null; }
    let stream: MediaStream;
    try {
      // preferCurrentTab e selfBrowserSurface: o Chrome e o Edge já oferecem esta aba (ainda fora dos tipos do TS).
      const opcoes = { video: { displaySurface: 'browser' }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include' };
      stream = await navigator.mediaDevices.getDisplayMedia(opcoes as DisplayMediaStreamOptions);
    } catch {
      setAviso('Captura cancelada.');
      return null;
    }
    setCapturando(true);
    try {
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      // Espera a barra sumir da tela e um quadro novo chegar.
      await new Promise(r => setTimeout(r, 400));
      const foto = document.createElement('canvas');
      foto.width = video.videoWidth;
      foto.height = video.videoHeight;
      foto.getContext('2d')?.drawImage(video, 0, 0);
      stream.getTracks().forEach(t => t.stop());
      const blob = await new Promise<Blob | null>(r => foto.toBlob(r, 'image/png'));
      if (!blob) throw new Error('imagem vazia');
      return blob;
    } catch (e) {
      console.warn('[canvas] tela não capturada', e);
      setAviso('Não foi possível capturar a tela.');
      return null;
    } finally {
      stream.getTracks().forEach(t => t.stop());
      setCapturando(false);
    }
  };

  const copiarTela = async () => {
    const blob = await capturarTela();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setAviso('Tela copiada. Cole com Ctrl+V.');
    } catch {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tela-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setAviso('O navegador não deixou copiar; a imagem foi baixada.');
    }
  };

  const mandarParaAprovacao = async () => {
    const blob = await capturarTela();
    if (!blob) return;
    mandarImagemParaAprovacao(blob);
    onFechar();
  };
  const copiarRef = useRef(copiarTela);
  useEffect(() => { copiarRef.current = copiarTela; });

  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Escape') { e.preventDefault(); onFechar(); return; }
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); desfazer(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); refazer(); }
      else if (k === 'c') { e.preventDefault(); void copiarRef.current(); }
    };
    window.addEventListener('keydown', teclas);
    return () => window.removeEventListener('keydown', teclas);
  }, [onFechar, desfazer, refazer]);

  const ponto = (e: ReactPointerEvent) => ({ x: e.clientX, y: e.clientY });
  const iniciar = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (textoAberto.current) { e.preventDefault(); confirmarTexto(); return; }
    if (ferramenta === 'texto') { e.preventDefault(); abrirTexto(ponto(e)); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = ponto(e);
    atual.current = { ferramenta, cor, espessura, pontos: [p], ancora: fixar ? ancorar(p, camadaRef.current) : undefined };
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
    adicionar(t);
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
  const tamEditor = tamanhoTexto(espessura);

  return (
    <Box ref={camadaRef} sx={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      <Box
        component="canvas"
        ref={canvasRef}
        aria-label="Área de desenho"
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        sx={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none',
          cursor: ferramenta === 'texto' ? 'text' : 'crosshair',
          boxShadow: capturando ? 'none' : 'inset 0 0 0 3px #E79A25',
        }}
      />
      {editor && (
        <Box
          component="textarea"
          autoFocus
          aria-label="Texto do desenho"
          value={editor.texto}
          onChange={e => setEditor({ ...editor, texto: e.target.value })}
          onBlur={confirmarTexto}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); desistirTexto(); }
            else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmarTexto(); }
          }}
          rows={Math.max(1, editor.texto.split('\n').length)}
          sx={{
            position: 'absolute', left: editor.x, top: editor.y, zIndex: 2050, m: 0, p: 0, border: 0,
            outline: '1px dashed rgb(0 0 0 / 0.45)', outlineOffset: '3px', bgcolor: 'transparent', resize: 'none',
            overflow: 'hidden', whiteSpace: 'pre', fieldSizing: 'content', minWidth: 40,
            color: cor, caretColor: cor, font: `600 ${tamEditor}px/${ALTURA_LINHA} ${fonte}`,
          }}
        />
      )}
      {!capturando && (
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
              <Tooltip key={px} title={`Espessura ${nome.toLowerCase()} (texto ${tamanhoTexto(px)} px)`} {...dicaSx}>
                <IconButton aria-label={`Espessura ${nome}`} aria-pressed={espessura === px} onClick={() => setEspessura(px)} sx={{ ...botao(espessura === px), width: 30 }}>
                  <Box component="span" sx={{ width: px + 2, height: px + 2, borderRadius: '50%', bgcolor: '#fff' }} />
                </IconButton>
              </Tooltip>
            );
          })}
          {separador}
          <Tooltip title={fixar ? 'Fixo na página: o desenho acompanha a rolagem (clique para soltar)' : 'Fixar na página: o desenho fica onde foi feito ao rolar'} {...dicaSx}>
            <IconButton aria-label="Fixar na página" aria-pressed={fixar} onClick={alternarFixar} sx={botao(fixar)}>
              <Pin size={18} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Copiar a tela com o desenho (Ctrl+C)" {...dicaSx}>
            <IconButton aria-label="Copiar a tela" onClick={() => void copiarTela()} sx={botao(false)}><Copy size={18} /></IconButton>
          </Tooltip>
          {paraAprovacao && (
            <Tooltip title="Mandar para Aprovar página: captura a tela com o desenho e põe a imagem na aprovação desta página" {...dicaSx}>
              <IconButton aria-label="Mandar para Aprovar página" onClick={() => void mandarParaAprovacao()} sx={botao(false)}><ImageUp size={18} /></IconButton>
            </Tooltip>
          )}
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
      )}
      {aviso && !capturando && (
        <Box role="status" sx={{
          position: 'absolute', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 2100, px: 2, py: 1,
          borderRadius: '8px', bgcolor: 'primary.main', color: '#fff', fontSize: 14, boxShadow: '0 8px 24px rgb(0 0 0 / 0.3)',
        }}>
          {aviso}
        </Box>
      )}
    </Box>
  );
}
