import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { listar, listarPessoas, prepararPrimeiroUso, type Pessoa, type Row } from './api.ts';

// Quem está usando o Friday: a pessoa logada no sistema (useAuth); id = UID, admin = adm2 ativo.
export type Eu = { id: string; nome: string; admin: boolean };

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
  const [areaId, setAreaIdState] = useState(() => ler('friday:area'));

  const uid = currentUser?.uid;
  const nome = authorizationProfile?.nome || currentUser?.displayName || currentUser?.email || 'Sem nome';
  const admin = authorizationProfile?.ativo === true && authorizationProfile.adm2 === true;
  const usuario = useMemo<Eu | null>(() => (uid ? { id: uid, nome, admin } : null), [uid, nome, admin]);

  const recarregar = useCallback(async () => {
    const [usuarios, areas, pastas, quadros] = await Promise.all([listarPessoas(), listar('areas'), listar('pastas'), listar('quadros')]);
    // Quadros de subitens são internos (aparecem dentro do item pai), não na lateral.
    setDados({ usuarios, areas, pastas, quadros: quadros.filter(q => q.tipo !== 'subitens') });
  }, []);

  // Ao abrir (ou ao trocar a pessoa logada): prepara o Friday vazio, se for o caso, e carrega a navegação.
  useEffect(() => {
    if (!uid) return;
    let vivo = true;
    setCarregado(false);
    prepararPrimeiroUso()
      .then(async () => { if (!vivo) return; setErro(null); await recarregar(); })
      .catch(e => { if (vivo) setErro((e as Error).message); })
      .finally(() => { if (vivo) setCarregado(true); });
    return () => { vivo = false; };
  }, [uid, recarregar]);

  const setAreaId = (id: number) => { gravar('friday:area', id); setAreaIdState(id); };
  const nomeUsuario = useCallback((id: unknown) => dados.usuarios.find(u => u.id === String(id))?.nome ?? '—', [dados.usuarios]);
  const areaValida = dados.areas.some(a => a.id === areaId) ? areaId : dados.areas[0]?.id ?? null;

  return (
    <NavCtx.Provider value={{ ...dados, carregado, erro, usuario, areaId: areaValida, setAreaId, recarregar, nomeUsuario }}>
      {children}
    </NavCtx.Provider>
  );
}

export const useNav = () => useContext(NavCtx);
