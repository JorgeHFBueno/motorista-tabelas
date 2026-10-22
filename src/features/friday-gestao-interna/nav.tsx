import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api, encerrarSessao, iniciarSessao, listarPessoas, SEM_SESSAO, type Pessoa, type Row, type Sessao } from './api.ts';

// Quem está usando o Friday: a pessoa logada no sistema (Firebase Auth + funcionarios); id = UID.
export type Eu = Sessao;

// Permissões por área/pasta/quadro (restrito, ver/editar) chegam na etapa de credenciais.
// Até lá os menus de permissão ficam escondidos e todos os funcionários ativos editam.
export const PERMISSOES_FINAS = false;

// Estado global: quem entrou e a navegação (pessoas, áreas de trabalho, pastas e quadros).
type Ctx = {
  carregado: boolean;
  erro: string | null;
  // Pessoas = funcionários (ativos e inativos); para escolher alguém, use só os ativos.
  usuarios: Pessoa[];
  areas: Row[];
  pastas: Row[];
  quadros: Row[];
  usuario: Eu | null;
  sair: () => Promise<void>;
  areaId: number | null;
  setAreaId: (id: number) => void;
  recarregar: () => Promise<void>;
  nomeUsuario: (id: unknown) => string;
};

const NavCtx = createContext<Ctx>(null as never);

const ler = (k: string) => { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } };
const gravar = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* sem armazenamento */ } };
const VAZIO = { usuarios: [] as Pessoa[], areas: [] as Row[], pastas: [] as Row[], quadros: [] as Row[] };

export function NavProvider({ children }: { children: ReactNode }) {
  const { currentUser, authorizationProfile } = useAuth();
  const [dados, setDados] = useState(VAZIO);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Eu | null>(null);
  const [areaId, setAreaIdState] = useState(() => ler('friday:area'));

  const recarregar = useCallback(async () => {
    const [usuarios, areas, pastas, quadros] = await Promise.all([listarPessoas(), ...['areas', 'pastas', 'quadros'].map(r => api.list(r))]);
    // Quadros de subitens são internos (aparecem dentro do item pai), não na lateral.
    setDados({ usuarios, areas, pastas, quadros: quadros.filter(q => q.tipo !== 'subitens') });
  }, []);

  // Ao abrir: abre a sessão com o funcionário logado e carrega a navegação.
  const uid = currentUser?.uid;
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    setCarregado(false);
    iniciarSessao({
      uid,
      nome: authorizationProfile?.nome || currentUser?.displayName || currentUser?.email || 'Sem nome',
      email: currentUser?.email?.toLowerCase() ?? null,
      adm2: authorizationProfile?.ativo === true && authorizationProfile.adm2 === true,
    })
      .then(async eu => { if (!vivo) return; setUsuario(eu); setErro(null); await recarregar(); })
      .catch(e => { if (vivo) setErro((e as Error).message); })
      .finally(() => { if (vivo) setCarregado(true); });
    return () => { vivo = false; encerrarSessao(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a sessão muda só quando muda a pessoa logada
  }, [uid, recarregar]);
  // Sessão perdida no meio do uso.
  useEffect(() => {
    const fim = () => { setUsuario(null); setDados(VAZIO); };
    window.addEventListener(SEM_SESSAO, fim);
    return () => window.removeEventListener(SEM_SESSAO, fim);
  }, []);

  const sair = async () => { encerrarSessao(); setUsuario(null); setDados(VAZIO); };
  const setAreaId = (id: number) => { gravar('friday:area', id); setAreaIdState(id); };
  const nomeUsuario = useCallback((id: unknown) => dados.usuarios.find(u => u.id === String(id))?.nome ?? '—', [dados.usuarios]);
  const areaValida = dados.areas.some(a => a.id === areaId) ? areaId : dados.areas[0]?.id ?? null;

  return (
    <NavCtx.Provider value={{ ...dados, carregado, erro, usuario, sair, areaId: areaValida, setAreaId, recarregar, nomeUsuario }}>
      {children}
    </NavCtx.Provider>
  );
}

export const useNav = () => useContext(NavCtx);
