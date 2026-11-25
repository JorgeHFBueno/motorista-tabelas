import { useEffect, useState } from 'react';
import type { JogoOnline } from './sala';

// Pedido de abrir um jogo online numa sala, vindo de um aviso de convite ou "JOGUE" (/dev?jogo=xadrez&sala=<id>):
// o Desktop pede e abre a janela, o jogo começa online (useOnline) e useSalas entra na sala (tomarSalaPedida).
let pedido: { jogo: JogoOnline; sala: string | null } | null = null;
const EVENTO = 'ledur:dev-online';

export function pedirOnline(jogo: JogoOnline, sala: string | null) {
  pedido = { jogo, sala };
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: jogo }));
}

/** Estado "online" do jogo: começa ligado se há pedido para ele; um pedido novo (janela já aberta) liga. */
export function useOnline(jogo: JogoOnline): [boolean, (online: boolean) => void] {
  const [online, setOnline] = useState(() => pedido?.jogo === jogo);
  useEffect(() => {
    const ligar = (e: Event) => { if ((e as CustomEvent<unknown>).detail === jogo) setOnline(true); };
    window.addEventListener(EVENTO, ligar);
    return () => window.removeEventListener(EVENTO, ligar);
  }, [jogo]);
  return [online, setOnline];
}

/** A sala pedida para este jogo, uma vez só (quem pega entra nela). */
export function tomarSalaPedida(jogo: JogoOnline): string | null {
  if (pedido?.jogo !== jogo || !pedido.sala) return null;
  const sala = pedido.sala;
  pedido = null;
  return sala;
}

