import { useMemo } from 'react';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { ArquivoPortal, PessoaRef } from './portalDominio';

// Shared Firebase helpers of the portal area (team side, adm2).

/** Uploads a file to a portal/... path (the Storage Rules never allow overwriting) and returns its reference. */
export async function enviarArquivo(caminho: string, arquivo: File, limiteBytes: number): Promise<ArquivoPortal> {
  if (arquivo.size > limiteBytes) {
    throw new Error(`O arquivo passa do limite de ${Math.round(limiteBytes / (1024 * 1024))} MB.`);
  }
  const contentType = arquivo.type || 'application/octet-stream';
  await uploadBytes(ref(storage, caminho), arquivo, { contentType });
  return { path: caminho, nome: arquivo.name, contentType, bytes: arquivo.size };
}

/** Download link asked at read time; null when the file is missing or not readable. */
export async function urlDoArquivo(arquivo: { path?: string } | null | undefined): Promise<string | null> {
  if (!arquivo?.path) return null;
  try {
    return await getDownloadURL(ref(storage, arquivo.path));
  } catch {
    return null;
  }
}

/** Opens a file in a new tab, opened during the click so it is not blocked as a pop-up. */
export async function abrirArquivo(arquivo: { path?: string } | null | undefined): Promise<boolean> {
  const janela = window.open('', '_blank');
  const url = await urlDoArquivo(arquivo);
  if (!url || !janela) {
    janela?.close();
    return false;
  }
  janela.opener = null;
  janela.location.href = url;
  return true;
}

/** Signed-in team member as {uid, nome}, for criadoPor, atualizadoPor, confirmadoPor, autor... (the Rules check the uid). */
export function usePessoaAtual(): PessoaRef | null {
  const { currentUser, authorizationProfile } = useAuth();
  return useMemo(
    () => (currentUser ? { uid: currentUser.uid, nome: authorizationProfile?.nome || currentUser.displayName || currentUser.email || 'Equipe Ledur' } : null),
    [authorizationProfile?.nome, currentUser],
  );
}
