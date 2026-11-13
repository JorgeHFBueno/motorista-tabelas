import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './firebaseAdmin.js';
import { temCredencial } from './credenciais.js';

// Local de uma programação do Cronograma Logístico (WEB /logistica/cronograma): a pessoa cola um link do Google Maps e
// a WEB grava a coordenada, a cidade e o estado. O link curto (maps.app.goo.gl), que o celular gera ao compartilhar, só
// se abre daqui: o navegador não lê o redirecionamento do Google. Cidade e estado vêm do Nominatim (OpenStreetMap).
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/01_FUNCTIONS_VIGENTES.md e 03_APLICACAO_WEB/15_LOGISTICA.md.
type AnyRecord = Record<string, any>;

export interface Coordenada { lat: number; lng: number }
/** `link`: o link do Maps achado no texto colado (o curto fica curto). */
export interface LocalLido extends Coordenada { link: string; cidade: string; uf: string }

const MAX_LINK = 2000;
const MAX_SALTOS = 3;
const NUMERO = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAR = new RegExp(`^\\s*${NUMERO}\\s*,\\s*\\+?\\s*${NUMERO}\\s*$`);

const ehCurto = (url: URL) => url.hostname === 'maps.app.goo.gl' || (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps'));

/** Só links do Google Maps: os curtos e os de google.com(.br)/maps e maps.google.com(.br). */
export function ehLinkDoMaps(url: URL): boolean {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  if (ehCurto(url)) return true;
  if (host === 'maps.google.com' || host === 'maps.google.com.br') return true;
  return ['google.com', 'www.google.com', 'google.com.br', 'www.google.com.br'].includes(host) && url.pathname.startsWith('/maps');
}

/** O link no texto colado (o celular manda "Nome do lugar" e o link juntos); null quando não há link do Maps. */
export function linkDoTexto(texto: unknown): URL | null {
  if (typeof texto !== 'string' || texto.length > MAX_LINK * 2) return null;
  const achado = texto.match(/https?:\/\/[^\s<>"]+/i)?.[0];
  if (!achado || achado.length > MAX_LINK) return null;
  try {
    const url = new URL(achado);
    return ehLinkDoMaps(url) ? url : null;
  } catch {
    return null;
  }
}

const valida = (lat: number, lng: number): Coordenada | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0) ? { lat, lng } : null;

const par = (texto: string | null) => {
  const achado = texto?.match(PAR);
  return achado ? valida(Number(achado[1]), Number(achado[2])) : null;
};

function decodificado(texto: string): string {
  try { return decodeURIComponent(texto); } catch { return texto; }
}

/**
 * Coordenada escrita no link, na ordem: o pino do lugar (!3d…!4d…), os parâmetros (q, query, ll, center, destination,
 * daddr), o caminho (/search|place|dir/lat,lng) e por último o centro da tela (@lat,lng).
 */
export function coordenadaDoLink(url: URL): Coordenada | null {
  const texto = decodificado(url.href);
  const pino = texto.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pino) { const c = valida(Number(pino[1]), Number(pino[2])); if (c) return c; }
  for (const nome of ['q', 'query', 'll', 'center', 'destination', 'daddr']) {
    const c = par(url.searchParams.get(nome));
    if (c) return c;
  }
  const caminho = decodificado(url.pathname).replace(/\+/g, ' ').match(/\/(?:search|place|dir)\/([^/]+)/);
  const doCaminho = caminho ? par(caminho[1]) : null;
  if (doCaminho) return doCaminho;
  const tela = texto.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return tela ? valida(Number(tela[1]), Number(tela[2])) : null;
}

/** Nome ou endereço do lugar no link (/place/… ou q=), para buscar quando o link não traz coordenada. */
export function textoDoLugar(url: URL): string | null {
  const caminho = url.pathname.match(/\/place\/([^/]+)/);
  const bruto = caminho ? decodificado(caminho[1].replace(/\+/g, ' ')) : url.searchParams.get('q') ?? url.searchParams.get('query');
  const limpo = bruto?.replace(/\s+/g, ' ').trim() ?? '';
  return limpo && !par(limpo) ? limpo.slice(0, 300) : null;
}

/** Cidade e estado do endereço do Nominatim; no Brasil, a sigla (ISO3166-2 "BR-RS" → "RS"). */
export function cidadeEstado(endereco: AnyRecord | null | undefined): { cidade: string; uf: string } {
  const a = endereco ?? {};
  const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const cidade = [a.city, a.town, a.village, a.municipality, a.city_district, a.county].map(texto).find(Boolean) ?? '';
  const iso = texto(a['ISO3166-2-lvl4']);
  const uf = /^BR-[A-Z]{2}$/.test(iso) ? iso.slice(3) : texto(a.state);
  return { cidade: cidade.slice(0, 100), uf: uf.slice(0, 60) };
}

export interface LogisticaLocalStore {
  getEmployee(uid: string): Promise<AnyRecord | undefined>;
  /** Para onde o link redireciona (o Location de uma resposta 3xx); null quando não redireciona. */
  redirecionamento(url: string): Promise<string | null>;
  /** O `address` do Nominatim para a coordenada; null quando não há. */
  enderecoDa(coordenada: Coordenada): Promise<AnyRecord | null>;
  /** A coordenada do primeiro resultado do Nominatim para o texto; null quando não acha. */
  buscar(texto: string): Promise<Coordenada | null>;
}

const NAO_ACHEI = 'Não achei o local nesse link. No Google Maps, abra o lugar e use Compartilhar > Copiar link.';

/** O link curto vira o link completo (até MAX_SALTOS redirecionamentos, só para links do Maps). */
async function linkCompleto(url: URL, store: LogisticaLocalStore): Promise<URL> {
  let atual = url;
  for (let salto = 0; salto < MAX_SALTOS && ehCurto(atual); salto += 1) {
    let destino: string | null;
    try {
      destino = await store.redirecionamento(atual.href);
    } catch {
      throw new HttpsError('unavailable', 'Não consegui abrir o link do Maps agora. Tente de novo.');
    }
    if (!destino) break;
    let proximo: URL;
    try { proximo = new URL(destino, atual); } catch { break; }
    // Página de consentimento do Google (fora do Brasil): o link do Maps vai em "continue".
    if (proximo.hostname === 'consent.google.com' && proximo.searchParams.get('continue')) {
      try { proximo = new URL(proximo.searchParams.get('continue') as string); } catch { break; }
    }
    if (!ehLinkDoMaps(proximo)) break;
    atual = proximo;
  }
  return atual;
}

const arredondar = (n: number) => Math.round(n * 1e7) / 1e7;

export function createLogisticaLocalService(store: LogisticaLocalStore) {
  return async (uid: string | undefined, dados: unknown): Promise<LocalLido> => {
    if (!uid) throw new HttpsError('unauthenticated', 'Autenticação obrigatória.');
    if (!temCredencial(await store.getEmployee(uid), 'logistica', 'mecanico')) throw new HttpsError('permission-denied', 'Acesso não autorizado.');
    const url = linkDoTexto((dados as AnyRecord | null)?.link);
    if (!url) throw new HttpsError('invalid-argument', 'Cole um link do Google Maps.');

    const completo = await linkCompleto(url, store);
    let coordenada = coordenadaDoLink(completo);
    if (!coordenada) {
      const lugar = textoDoLugar(completo);
      coordenada = lugar ? await store.buscar(lugar).catch(() => null) : null;
    }
    if (!coordenada) throw new HttpsError('not-found', NAO_ACHEI);

    const { cidade, uf } = cidadeEstado(await store.enderecoDa(coordenada).catch(() => null));
    return { link: url.href, lat: arredondar(coordenada.lat), lng: arredondar(coordenada.lng), cidade, uf };
  };
}

// Nominatim: até 1 pedido por segundo e um User-Agent que identifique o sistema (política de uso do OpenStreetMap).
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const CABECALHOS = { 'User-Agent': 'LedurMotoristaWeb/1.0 (cronograma logistico)', 'Accept-Language': 'pt-BR' };

async function nominatim(caminho: string, parametros: Record<string, string>): Promise<any> {
  const resposta = await fetch(`${NOMINATIM}${caminho}?${new URLSearchParams({ format: 'jsonv2', ...parametros })}`, {
    headers: CABECALHOS,
    signal: AbortSignal.timeout(8000),
  });
  if (!resposta.ok) throw new Error(`Nominatim ${resposta.status}`);
  return resposta.json();
}

const service = createLogisticaLocalService({
  async getEmployee(uid) {
    const snapshot = await db.collection('funcionarios').doc(uid).get();
    return snapshot.exists ? snapshot.data() : undefined;
  },
  async redirecionamento(url) {
    const resposta = await fetch(url, { method: 'GET', redirect: 'manual', headers: CABECALHOS, signal: AbortSignal.timeout(8000) });
    return resposta.status >= 300 && resposta.status < 400 ? resposta.headers.get('location') : null;
  },
  async enderecoDa({ lat, lng }) {
    const resultado = await nominatim('/reverse', { lat: String(lat), lon: String(lng), zoom: '10', addressdetails: '1' });
    return resultado && typeof resultado.address === 'object' ? resultado.address : null;
  },
  async buscar(texto) {
    const lista = await nominatim('/search', { q: texto, limit: '1' });
    const primeiro = Array.isArray(lista) ? lista[0] : null;
    return primeiro ? valida(Number(primeiro.lat), Number(primeiro.lon)) : null;
  },
});

export const logisticaLocal = onCall({ region: 'southamerica-east1' }, (request) => service(request.auth?.uid, request.data));
