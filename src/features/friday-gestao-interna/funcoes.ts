import { connectFunctionsEmulator } from 'firebase/functions';
import { functions } from '../../firebase';

// Cloud Functions usadas pelo Friday (importação do monday e cadastros oficiais). Com os emuladores ligados
// (VITE_USE_FIREBASE_EMULATORS), as chamadas vão para o emulador de Functions.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  try { connectFunctionsEmulator(functions, '127.0.0.1', 5001); } catch { /* já conectado */ }
}

export { functions };
