import { Timestamp, where, type QueryConstraint } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";
import type { ObraDoc } from "@/types/rbac";

// Collections of the portal in app-motor-api (Manuscript 01_FIRESTORE/COLECOES/portal.md).
export const PORTAL_COLECOES = {
  obras: "portal-obras",
  documentos: "portal-documentos",
  fotos: "portal-fotos",
  parcelas: "portal-parcelas",
  atendimentos: "portal-atendimentos",
  noticias: "portal-noticias",
} as const;

// File reference stored in Firestore: only the Storage path, never a download URL.
export interface ArquivoPortal {
  path: string;
  nome?: string;
  contentType?: string;
  bytes?: number;
}

// The Rules accept a client query only with clienteDocumento in [...] and, where there is a trash,
// excluidoEm == null. Every record of a contract query uses these filters.
export const filtrosDoContrato = (obra: Pick<ObraDoc, "id" | "clienteDocumento">): QueryConstraint[] => [
  where("clienteDocumento", "in", [obra.clienteDocumento]),
  where("obraId", "==", obra.id),
  where("excluidoEm", "==", null),
];

export const centavosParaReais = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value / 100 : 0;

// 'AAAA-MM-DD' (day only) as a local-noon Timestamp, so the day never shifts with the time zone.
export const dataIsoParaTimestamp = (value: unknown): Timestamp | undefined => {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const [, ano, mes, dia] = match;
  return Timestamp.fromDate(new Date(Number(ano), Number(mes) - 1, Number(dia), 12));
};

export const toArquivo = (value: unknown): ArquivoPortal | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.path !== "string" || raw.path.length === 0) return null;
  return {
    path: raw.path,
    nome: typeof raw.nome === "string" ? raw.nome : undefined,
    contentType: typeof raw.contentType === "string" ? raw.contentType : undefined,
    bytes: typeof raw.bytes === "number" ? raw.bytes : undefined,
  };
};

// Download URL asked at read time; the Storage Rules check the client's access.
export const urlDoArquivo = async (arquivo: ArquivoPortal | null | undefined): Promise<string | undefined> => {
  if (!arquivo?.path || !storage) return undefined;
  try {
    return await getDownloadURL(ref(storage, arquivo.path));
  } catch (error) {
    if (import.meta.env.DEV) console.error("[portal] falha ao obter o arquivo", { path: arquivo.path, error });
    return undefined;
  }
};

// Opens a file in a new tab. The tab is opened during the click (so it is not blocked as a pop-up) and receives
// the link once the Storage answers. Returns false when the file could not be opened.
export const abrirArquivo = async (arquivo: ArquivoPortal | null | undefined): Promise<boolean> => {
  const janela = window.open("", "_blank");
  const url = await urlDoArquivo(arquivo);
  if (!url || !janela) {
    janela?.close();
    return false;
  }
  janela.opener = null;
  janela.location.href = url;
  return true;
};

export const toMillis = (value: unknown): number => {
  const withMillis = value as { toMillis?: () => number };
  return typeof withMillis?.toMillis === "function" ? withMillis.toMillis() : 0;
};
