import { INTENSIDADES, type IntensidadeCrt } from './crt/parametros';

// Preferências da área DEV, só neste navegador (localStorage, padrão `ledur:*` do Friday). Nada vai para o Firestore.
export type PrefsDev = { bootSempre: boolean; crt: boolean; crtIntensidade: IntensidadeCrt };

const CHAVE = 'ledur:dev-prefs';

/** Valor salvo (qualquer coisa) → preferências válidas; o que faltar ou vier errado fica no padrão. */
export function normalizarPrefs(valor: unknown): PrefsDev {
  const p = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  return {
    bootSempre: p.bootSempre === true,
    crt: p.crt !== false,
    crtIntensidade: INTENSIDADES.includes(p.crtIntensidade as IntensidadeCrt) ? (p.crtIntensidade as IntensidadeCrt) : 'media',
  };
}

export function lerPrefs(): PrefsDev {
  try {
    return normalizarPrefs(JSON.parse(localStorage.getItem(CHAVE) ?? '{}'));
  } catch {
    return normalizarPrefs({});
  }
}

export function gravarPrefs(prefs: PrefsDev) {
  try { localStorage.setItem(CHAVE, JSON.stringify(prefs)); } catch { /* sem armazenamento */ }
}
