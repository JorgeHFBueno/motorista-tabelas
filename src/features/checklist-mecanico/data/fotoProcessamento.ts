// Fotos e assinatura do checklist no navegador (canvas), seguindo as regras de domain/foto.ts. O navegador endireita a
// foto pela orientação do EXIF ao desenhar a imagem; o iPhone entrega HEIC convertido em JPEG ao campo de arquivo.
import {
  BYTES_MAXIMOS_FOTO, LADO_MAXIMO_FOTO, LADO_MINIATURA, QUALIDADE_ASSINATURA, QUALIDADE_INICIAL_FOTO,
  QUALIDADE_MINIATURA, limitarLado, medidasAssinatura, proximaCompressao, tamanhoFonteCarimbo, type Ponto,
} from '../domain/foto';

export type FotoProcessada = { foto: Blob; miniatura: Blob; largura: number; altura: number };

function carregarImagem(arquivo: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(arquivo);
  return new Promise((resolve, reject) => {
    const imagem = new Image();
    imagem.onload = () => { URL.revokeObjectURL(url); resolve(imagem); };
    imagem.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Arquivo de imagem não reconhecido.')); };
    imagem.src = url;
  });
}

function novoCanvas(largura: number, altura: number) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível.');
  return { canvas, ctx };
}

function paraJpeg(canvas: HTMLCanvasElement, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Falha ao gerar o JPEG.'))), 'image/jpeg', qualidade / 100);
  });
}

function redimensionar(origem: CanvasImageSource, largura: number, altura: number): HTMLCanvasElement {
  const { canvas, ctx } = novoCanvas(largura, altura);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origem, 0, 0, largura, altura);
  return canvas;
}

/** Texto branco sobre faixa preta semitransparente no canto inferior direito. */
function carimbar(ctx: CanvasRenderingContext2D, largura: number, altura: number, texto: string) {
  const fonte = tamanhoFonteCarimbo(largura);
  const linha = Math.round(fonte * 1.15);
  const margem = Math.round(linha / 2);
  ctx.font = `${fonte}px Arial, Helvetica, sans-serif`;
  const larguraTexto = ctx.measureText(texto).width;
  const x2 = largura - margem;
  const y2 = altura - margem;
  const x1 = Math.max(0, x2 - larguraTexto - 2 * margem);
  const y1 = Math.max(0, y2 - linha - margem);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.667)';
  ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, x1 + margem, (y1 + y2) / 2);
}

/** Endireita, limita o lado maior a 2048 px, grava o carimbo e comprime até 1 MB; gera a miniatura de 480 px. */
export async function processarFoto(arquivo: Blob, carimbo: string): Promise<FotoProcessada> {
  const imagem = await carregarImagem(arquivo);
  const { largura, altura } = limitarLado(imagem.naturalWidth, imagem.naturalHeight, LADO_MAXIMO_FOTO);
  let canvas = redimensionar(imagem, largura, altura);
  carimbar(canvas.getContext('2d')!, largura, altura, carimbo);

  let qualidade = QUALIDADE_INICIAL_FOTO;
  let foto = await paraJpeg(canvas, qualidade);
  for (let tentativas = 0; foto.size > BYTES_MAXIMOS_FOTO && tentativas < 40; tentativas++) {
    const proxima = proximaCompressao(qualidade);
    qualidade = proxima.qualidade;
    // Ainda grande com qualidade baixa: reduz a imagem (já carimbada, como no app) e tenta de novo.
    if (proxima.reduzir) canvas = redimensionar(canvas, Math.max(1, Math.round(canvas.width * 0.85)), Math.max(1, Math.round(canvas.height * 0.85)));
    foto = await paraJpeg(canvas, qualidade);
  }
  if (foto.size > BYTES_MAXIMOS_FOTO) throw new Error('Não foi possível reduzir a foto.');

  const mini = limitarLado(canvas.width, canvas.height, LADO_MINIATURA);
  const miniatura = await paraJpeg(redimensionar(canvas, mini.largura, mini.altura), QUALIDADE_MINIATURA);
  return { foto, miniatura, largura: canvas.width, altura: canvas.height };
}

/** JPEG da assinatura: traços pretos em fundo branco, 1200 px de largura, na proporção da área desenhada. */
export async function desenharAssinatura(tracos: readonly (readonly Ponto[])[], area: { largura: number; altura: number }) {
  const m = medidasAssinatura(area);
  const { canvas, ctx } = novoCanvas(m.largura, m.altura);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, m.largura, m.altura);
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';
  ctx.lineWidth = m.espessura;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const traco of tracos) {
    if (traco.length === 0) continue;
    if (traco.length === 1) {
      ctx.beginPath();
      ctx.arc(traco[0].x * m.escala, traco[0].y * m.escala, Math.ceil(m.espessura / 2), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    ctx.moveTo(traco[0].x * m.escala, traco[0].y * m.escala);
    for (const p of traco.slice(1)) ctx.lineTo(p.x * m.escala, p.y * m.escala);
    ctx.stroke();
  }
  const jpeg = await paraJpeg(canvas, QUALIDADE_ASSINATURA);
  return { jpeg, largura: m.largura, altura: m.altura };
}
