import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { aplicarManifestoDaRota } from './appMotorista';

/** Troca o manifesto conforme a tela (ver appMotorista.ts). Não desenha nada. */
export default function ManifestoDaRota() {
  const { pathname } = useLocation();
  useEffect(() => { aplicarManifestoDaRota(pathname); }, [pathname]);
  return null;
}
