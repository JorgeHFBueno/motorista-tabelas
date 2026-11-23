import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { registrarAbertura } from './usoWeb';
import { telaDaRota } from './usoWebCore';

/** Conta cada tela aberta por funcionário ativo em uso-web (Uso do sistema). Não desenha nada. */
export default function RegistroDeUso() {
  const { pathname } = useLocation();
  const { currentUser, authorizationProfile } = useAuth();
  const uid = currentUser?.uid ?? null;
  const ativo = authorizationProfile?.exists === true && authorizationProfile.ativo === true;

  useEffect(() => {
    const tela = telaDaRota(pathname);
    if (!uid || !ativo || !tela) return;
    registrarAbertura(uid, tela).catch((error: unknown) => console.warn('[uso] abertura não gravada', error));
  }, [pathname, uid, ativo]);

  return null;
}
