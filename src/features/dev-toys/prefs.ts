// Preferências da área DEV, só neste navegador (localStorage, padrão `ledur:*` do Friday). Nada vai para o Firestore.
export type PrefsDev = { bootSempre: boolean };

const CHAVE = 'ledur:dev-prefs';
const PADRAO: PrefsDev = { bootSempre: false };

export function lerPrefs(): PrefsDev {
  try {
    const valor: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? '{}');
    const p = valor && typeof valor === 'object' ? (valor as Partial<PrefsDev>) : {};
    return { bootSempre: p.bootSempre === true };
  } catch {
    return { ...PADRAO };
  }
}

export function gravarPrefs(prefs: PrefsDev) {
  try { localStorage.setItem(CHAVE, JSON.stringify(prefs)); } catch { /* sem armazenamento */ }
}
