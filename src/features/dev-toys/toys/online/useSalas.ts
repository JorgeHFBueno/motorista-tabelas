import { useEffect, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { useAuth } from '../../../../contexts/AuthContext';
import { db } from '../../../../firebase';
import { MAX_JOGADORES, lerMarcas, lerSala, marcar, minhaSala, nomeDev, salasLivres, type JogoOnline, type Sala } from './sala';

// Salas online no Firestore (dev-salas): a lista ao vivo das salas do jogo, a sala em que estou e as gravações. Toda
// gravação vai em transação e sobe a versão: se a sala mudou desde a tela, a jogada não vale e a tela atualiza.
const salasRef = collection(db, 'dev-salas');

/** O que muda numa jogada: a partida (JSON), de quem é a vez e se acabou. */
export type Jogada = { partida: string; vez: string | null; fim: boolean };

const mensagem = (e: unknown) => {
  const codigo = (e as { code?: string } | null)?.code ?? '';
  if (codigo.includes('permission-denied')) return 'SEM ACESSO AS SALAS';
  if (e instanceof Error && /^[A-Z ,.:!]+$/.test(e.message)) return e.message;
  return 'FALHOU. TENTE DE NOVO';
};

export function useSalas(jogo: JogoOnline) {
  const { currentUser, authorizationProfile } = useAuth();
  const uid = currentUser?.uid ?? '';
  const nome = nomeDev(authorizationProfile?.nome ?? currentUser?.email?.split('@')[0]);
  const [salas, setSalas] = useState<Sala[] | null>(null);
  // a sala que estou vendo; terminada, fica na tela (mesmo se outro jogador a apagar) até eu sair
  const [sala, setSala] = useState<Sala | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      query(salasRef, where('jogo', '==', jogo)),
      (snap) => {
        const lista = snap.docs
          .map((d) => {
            const v = d.data({ serverTimestamps: 'estimate' });
            const em = v.atualizadaEm?.toMillis?.() ?? Date.now();
            return lerSala(d.id, v, em);
          })
          .filter((s): s is Sala => !!s);
        setSalas(lista);
        setAgora(Date.now());
        setErro(null);
        const nova = minhaSala(lista, uid, lerMarcas().deixadas);
        setSala((antes) => nova ?? (antes?.estado === 'fim' && !lerMarcas().deixadas.includes(antes.id) ? antes : null));
      },
      (e) => setErro(mensagem(e)),
    );
  }, [jogo, uid]);

  /** Roda a gravação, mostrando o erro (e liberando os botões) no fim. */
  const executar = async (acao: () => Promise<unknown>) => {
    setOcupado(true);
    setErro(null);
    try { await acao(); } catch (e) { setErro(mensagem(e)); } finally { setOcupado(false); }
  };

  /** Grava na sala se ela ainda está na versão que a tela mostra. */
  const mudar = (s: Sala, campos: (atual: Sala) => Record<string, unknown>) =>
    runTransaction(db, async (t) => {
      const ref = doc(db, 'dev-salas', s.id);
      const snap = await t.get(ref);
      const atual = snap.exists() ? lerSala(snap.id, snap.data(), 0) : null;
      if (!atual) throw new Error('A SALA FOI FECHADA');
      if (atual.versao !== s.versao) throw new Error('A SALA MUDOU. TENTE DE NOVO');
      t.update(ref, { ...campos(atual), versao: atual.versao + 1, atualizadaEm: serverTimestamp() });
    });

  const criar = () => executar(() => addDoc(salasRef, {
    jogo, criadaPor: uid, jogadores: [uid], nomes: [nome], max: MAX_JOGADORES[jogo], estado: 'aberta',
    partida: null, vez: null, versao: 0, criadaEm: serverTimestamp(), atualizadaEm: serverTimestamp(),
  }));
  const entrar = (s: Sala) => executar(() => mudar(s, (a) => {
    if (a.estado !== 'aberta' || a.jogadores.length >= a.max) throw new Error('A SALA JA COMECOU OU ESTA CHEIA');
    return { jogadores: [...a.jogadores, uid], nomes: [...a.nomes, nome] };
  }));
  /** Sala aberta: quem criou fecha (apaga); quem entrou sai. */
  const sair = (s: Sala) => executar(() => (s.criadaPor === uid
    ? deleteDoc(doc(db, 'dev-salas', s.id))
    : mudar(s, (a) => {
      const i = a.jogadores.indexOf(uid);
      return { jogadores: a.jogadores.filter((_, k) => k !== i), nomes: a.nomes.filter((_, k) => k !== i) };
    })));
  const comecar = (s: Sala, partida: string, vez: string) => executar(() => mudar(s, () => ({ estado: 'jogando', partida, vez })));
  const jogar = (s: Sala, j: Jogada) => executar(() => mudar(s, () => ({ estado: j.fim ? 'fim' : 'jogando', partida: j.partida, vez: j.fim ? null : j.vez })));
  /** Depois do fim: a sala sai da tela e é apagada (quem ainda a vê continua com ela até sair). */
  const deixar = (s: Sala) => {
    marcar('deixadas', s.id);
    setSala(null);
    void deleteDoc(doc(db, 'dev-salas', s.id)).catch(() => { /* outro jogador já apagou */ });
  };

  return {
    uid,
    nome,
    sala,
    /** o meu assento na sala (-1 fora dela) */
    eu: sala ? sala.jogadores.indexOf(uid) : -1,
    livres: salas ? salasLivres(salas, uid, agora) : null,
    erro,
    ocupado,
    criar,
    entrar,
    sair,
    comecar,
    jogar,
    deixar,
  };
}

export type Salas = ReturnType<typeof useSalas>;
