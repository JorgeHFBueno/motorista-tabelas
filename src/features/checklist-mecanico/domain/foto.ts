// Regras das fotos e da assinatura do checklist, iguais às do app Flutter
// (data/checklist_foto_processamento.dart e data/checklist_assinatura.dart), sem depender do navegador.
import type { OrigemFoto } from './rascunho';

export const LADO_MAXIMO_FOTO = 2048;
export const BYTES_MAXIMOS_FOTO = 1_000_000;
export const LADO_MINIATURA = 480;
export const QUALIDADE_INICIAL_FOTO = 85;
export const QUALIDADE_MINIATURA = 70;

/** Texto gravado na foto: data e hora da câmera, ou a data original da galeria; sem data, "foto da galeria". */
export function textoCarimbo(origem: OrigemFoto, capturadaEm: Date | null): string {
  if (capturadaEm == null) return 'foto da galeria';
  const dois = (v: number) => String(v).padStart(2, '0');
  const d = capturadaEm;
  const data = `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
  return origem === 'galeria' ? `${data} (galeria)` : data;
}

/** Tamanho com o lado maior limitado a `lado`, mantendo a proporção. */
export function limitarLado(largura: number, altura: number, lado: number): { largura: number; altura: number } {
  if (largura <= lado && altura <= lado) return { largura, altura };
  return largura >= altura
    ? { largura: lado, altura: Math.max(1, Math.round((altura * lado) / largura)) }
    : { largura: Math.max(1, Math.round((largura * lado) / altura)), altura: lado };
}

/**
 * Próxima tentativa quando o JPEG passou de 1 MB: baixa a qualidade de 10 em 10 até 55; abaixo disso reduz a imagem
 * em 15% e volta a 75.
 */
export function proximaCompressao(qualidade: number): { qualidade: number; reduzir: boolean } {
  return qualidade > 55 ? { qualidade: qualidade - 10, reduzir: false } : { qualidade: 75, reduzir: true };
}

/** Fonte do carimbo: maior em fotos largas, como no app (arial 48 a partir de 1200 px, senão 24). */
export const tamanhoFonteCarimbo = (largura: number) => (largura >= 1200 ? 48 : 24);

const dataExif = (texto: string | null): Date | null => {
  const m = /(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(texto ?? '');
  if (!m) return null;
  const [ano, mes, dia, hora, minuto, segundo] = m.slice(1).map(Number);
  if (ano < 1990 || mes < 1 || mes > 12) return null;
  return new Date(ano, mes - 1, dia, hora, minuto, segundo);
};

/** Data original de um JPEG: EXIF `DateTimeOriginal`, ou `DateTime`; anos antes de 1990 são ignorados. */
export function dataOriginalDaFoto(bytes: Uint8Array): Date | null {
  try {
    const tags = lerTagsExif(bytes);
    return tags ? dataExif(tags.dateTimeOriginal) ?? dataExif(tags.dateTime) : null;
  } catch {
    return null;
  }
}

function lerTagsExif(bytes: Uint8Array): { dateTimeOriginal: string | null; dateTime: string | null } | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || dv.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) return null;
    const marcador = bytes[p + 1];
    if (marcador === 0xda || marcador === 0xd9) return null; // início da imagem: não há mais metadados
    const tamanho = dv.getUint16(p + 2);
    const inicio = p + 4;
    const ehExif = marcador === 0xe1 && inicio + 6 <= bytes.length
      && String.fromCharCode(...bytes.subarray(inicio, inicio + 4)) === 'Exif' && bytes[inicio + 4] === 0 && bytes[inicio + 5] === 0;
    if (ehExif) return lerTiff(dv, inicio + 6, Math.min(bytes.length, p + 2 + tamanho));
    p += 2 + tamanho;
  }
  return null;
}

function lerTiff(dv: DataView, tiff: number, fim: number): { dateTimeOriginal: string | null; dateTime: string | null } | null {
  const ordem = dv.getUint16(tiff);
  if (ordem !== 0x4949 && ordem !== 0x4d4d) return null;
  const le = ordem === 0x4949;
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);
  const ifd = (offset: number) => {
    const base = tiff + offset;
    const tags = new Map<number, { tipo: number; quantidade: number; valor: number }>();
    if (base + 2 > fim) return tags;
    const n = u16(base);
    for (let i = 0; i < n; i++) {
      const e = base + 2 + i * 12;
      if (e + 12 > fim) break;
      tags.set(u16(e), { tipo: u16(e + 2), quantidade: u32(e + 4), valor: e + 8 });
    }
    return tags;
  };
  const texto = (tag: { tipo: number; quantidade: number; valor: number } | undefined): string | null => {
    if (!tag || tag.tipo !== 2) return null;
    const inicio = tag.quantidade <= 4 ? tag.valor : tiff + u32(tag.valor);
    if (inicio + tag.quantidade > fim) return null;
    let s = '';
    for (let i = 0; i < tag.quantidade; i++) {
      const c = dv.getUint8(inicio + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const ifd0 = ifd(u32(tiff + 4));
  const ponteiroExif = ifd0.get(0x8769);
  const exif = ponteiroExif ? ifd(u32(ponteiroExif.valor)) : new Map();
  return { dateTimeOriginal: texto(exif.get(0x9003)), dateTime: texto(ifd0.get(0x0132)) };
}

// ------------------------------------------------------------------ assinatura

/** Comprimento mínimo dos traços (px da tela) para aceitar a assinatura e recusar um risco acidental. */
export const COMPRIMENTO_MINIMO_ASSINATURA = 60;
export const LARGURA_ASSINATURA = 1200;
export const QUALIDADE_ASSINATURA = 85;

export type Ponto = { x: number; y: number };

/** Comprimento total dos traços. */
export function comprimentoDosTracos(tracos: readonly (readonly Ponto[])[]): number {
  let total = 0;
  for (const traco of tracos) {
    for (let i = 1; i < traco.length; i++) total += Math.hypot(traco[i].x - traco[i - 1].x, traco[i].y - traco[i - 1].y);
  }
  return total;
}

/** JPEG da assinatura: 1200 px de largura, altura na proporção da área, traço de 3 px da tela na escala (2 a 12). */
export function medidasAssinatura(area: { largura: number; altura: number }): { largura: number; altura: number; escala: number; espessura: number } {
  const escala = LARGURA_ASSINATURA / area.largura;
  return {
    largura: LARGURA_ASSINATURA,
    altura: Math.min(1 << 14, Math.max(1, Math.round(area.altura * escala))),
    escala,
    espessura: Math.min(12, Math.max(2, 3 * escala)),
  };
}
