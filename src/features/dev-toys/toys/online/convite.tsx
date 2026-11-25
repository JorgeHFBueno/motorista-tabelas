import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../../../firebase';
import type { Sala } from './sala';

// Convite e "JOGUE" das salas online, como avisos do sistema (sino e notificação do computador), pelas Functions
// devPessoas e devAvisar: só entre Retr0. O clique no aviso abre o jogo na sala (pedidoOnline.ts).

export type PessoaDev = { uid: string; nome: string };

const chamarPessoas = httpsCallable<void, PessoaDev[]>(functions, 'devPessoas');
const chamarAvisar = httpsCallable<{ salaId: string; tipo: 'convite' | 'jogue'; para?: string[] }, { avisados: number }>(functions, 'devAvisar');

const mensagem = (e: unknown) => {
  const texto = e instanceof Error ? e.message : '';
  return /^[\p{L} .,!?()0-9-]+$/u.test(texto) && texto.length < 80 ? texto.toUpperCase() : 'FALHOU. TENTE DE NOVO';
};

// ---------------------------------------------------------------- convidar
/** Na sala aberta: a lista de Retr0 de fora da sala, cada um com [Convidar]. */
export function Convidar({ sala }: { sala: Sala }) {
  const [aberto, setAberto] = useState(false);
  const [pessoas, setPessoas] = useState<PessoaDev[] | null>(null);
  const [enviados, setEnviados] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);

  const abrir = () => {
    setAberto((a) => !a);
    if (pessoas === null) chamarPessoas().then((r) => setPessoas(r.data), (e) => { setPessoas([]); setErro(mensagem(e)); });
  };
  const convidar = (uid: string) => {
    setEnviando(uid);
    setErro(null);
    chamarAvisar({ salaId: sala.id, tipo: 'convite', para: [uid] })
      .then(() => setEnviados((l) => [...l, uid]), (e) => setErro(mensagem(e)))
      .finally(() => setEnviando(null));
  };
  const fora = (pessoas ?? []).filter((p) => !sala.jogadores.includes(p.uid));

  return (
    <>
      <div className="dt-jogo-botoes" data-opcoes>
        <button type="button" onClick={abrir} aria-expanded={aberto}>[Convidar]</button>
      </div>
      {aberto && (
        pessoas === null ? <p>PROCURANDO RETR0...</p>
          : fora.length ? (
            <ul className="dt-online-lista" data-opcoes>
              {fora.map((p) => (
                <li key={p.uid}>
                  {enviados.includes(p.uid)
                    ? <span>[CONVIDADO]</span>
                    : <button type="button" onClick={() => convidar(p.uid)} disabled={enviando !== null}>[Convidar]</button>} {p.nome.toUpperCase()}
                </li>
              ))}
            </ul>
          ) : <p>NINGUEM PARA CONVIDAR</p>
      )}
      {erro && <p className="dt-jogo-aviso">{erro}</p>}
    </>
  );
}

// ---------------------------------------------------------------- JOGUE
const ESPERA_JOGUE_MS = 30_000;

/** Na partida, fora da minha vez: chama quem está com a vez ("JOGUE!"), uma vez a cada 30 segundos. */
export function BotaoJogue({ sala }: { sala: Sala }) {
  const [liberaEm, setLiberaEm] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    if (liberaEm <= agora) return;
    const t = window.setTimeout(() => setAgora(Date.now()), Math.min(1000, liberaEm - agora));
    return () => window.clearTimeout(t);
  }, [liberaEm, agora]);
  const falta = Math.ceil((liberaEm - agora) / 1000);
  const chamar = () => {
    setLiberaEm(Date.now() + ESPERA_JOGUE_MS);
    setAgora(Date.now());
    setTexto(null);
    chamarAvisar({ salaId: sala.id, tipo: 'jogue' }).then(() => setTexto('CHAMADO!'), (e) => setTexto(mensagem(e)));
  };
  return (
    <div className="dt-jogo-botoes" data-opcoes>
      <button type="button" onClick={chamar} disabled={falta > 0}>{falta > 0 ? `[JOGUE! ${falta}s]` : '[Chamar: JOGUE!]'}</button>
      {texto && <span className="dt-jogo-legenda">{texto}</span>}
    </div>
  );
}
