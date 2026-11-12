import { useMemo, useState } from 'react';
import { PREFS_VAZIAS, prefsLimpas, type PrefsColunas } from '../domain/colunas';

function ler(chave: string): PrefsColunas {
  try {
    return prefsLimpas(JSON.parse(window.localStorage.getItem(chave) ?? 'null'));
  } catch {
    return PREFS_VAZIAS;
  }
}

/**
 * Ordenar, larguras, fixadas e ocultas do Quadro: de cada pessoa, neste navegador (localStorage). Sem o navegador
 * guardar (aba anônima, bloqueio), vale só enquanto a página está aberta.
 */
export function usePrefsColunas(uid: string) {
  const chave = `lg-quadro-colunas:${uid}`;
  const lidas = useMemo(() => ler(chave), [chave]);
  const [mudadas, setMudadas] = useState<{ chave: string; prefs: PrefsColunas } | null>(null);
  const prefs = mudadas?.chave === chave ? mudadas.prefs : lidas;
  const mudar = (alterar: (atuais: PrefsColunas) => PrefsColunas) => {
    const novas = prefsLimpas(alterar(prefs));
    setMudadas({ chave, prefs: novas });
    try {
      window.localStorage.setItem(chave, JSON.stringify(novas));
    } catch {
      // Sem localStorage, a preferência fica só nesta página.
    }
  };
  return [prefs, mudar] as const;
}
