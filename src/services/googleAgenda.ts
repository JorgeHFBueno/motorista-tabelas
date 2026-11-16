import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import './meuPerfil'; // liga o emulador de Functions, quando em uso

// Google Agenda do Friday (Function fridayAgenda): os itens com data em que a pessoa está vão para a agenda "Friday"
// do Google dela. A autorização fica no servidor; a tela só pede o status, conecta, sincroniza ou desconecta.
export type StatusAgenda =
  | { conectado: false }
  | { conectado: true; email: string | null; erro: 'reconectar' | 'agenda_apagada' | null; sincronizando: boolean; conectado_em: string };

const chamar = async <T>(dados: Record<string, unknown>) => (await httpsCallable<Record<string, unknown>, T>(functions, 'fridayAgenda')(dados)).data;

export const statusAgenda = () => chamar<StatusAgenda>({ acao: 'status' });
export const sincronizarAgenda = () => chamar<{ ok: true }>({ acao: 'sincronizar' });
export const desconectarAgenda = () => chamar<{ conectado: false }>({ acao: 'desconectar' });

/** Vai para a tela de autorização do Google; a volta cai em /perfil?agenda=<resultado>. */
export async function conectarAgenda() {
  const { url } = await chamar<{ url: string }>({ acao: 'conectar', origem: window.location.origin });
  window.location.assign(url);
}

export const RESULTADO_CONEXAO: Record<string, { tipo: 'success' | 'info' | 'warning' | 'error'; texto: string }> = {
  conectada: { tipo: 'success', texto: 'Google Agenda conectado. Os itens aparecem na agenda “Friday” em alguns minutos.' },
  cancelada: { tipo: 'info', texto: 'Conexão cancelada no Google.' },
  'sem-permissao': { tipo: 'warning', texto: 'Na tela do Google, deixe marcada a permissão da agenda para conectar.' },
  erro: { tipo: 'error', texto: 'Não foi possível conectar o Google Agenda. Tente de novo.' },
};
