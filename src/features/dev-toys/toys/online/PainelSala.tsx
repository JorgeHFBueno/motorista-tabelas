import type { Salas } from './useSalas';

// Antes da partida online: a lista de salas abertas (entrar ou criar) e, dentro de uma sala aberta, quem já está
// nela; quem criou começa (com 2 ou mais) ou fecha a sala, quem entrou sai. Fica no painel ao lado da mesa.
export function PainelSala({ s, minimo, onComecar, onVoltar }: { s: Salas; minimo: number; onComecar: () => void; onVoltar: () => void }) {
  const { sala, livres, erro, ocupado } = s;

  if (sala && sala.estado === 'aberta') {
    const criei = sala.criadaPor === s.uid;
    const faltam = minimo - sala.jogadores.length;
    return (
      <>
        <p className="dt-jogo-legenda">SALA DE {sala.nomes[0]} ({sala.jogadores.length}/{sala.max})</p>
        <ul className="dt-online-lista">
          {sala.nomes.map((n, i) => <li key={sala.jogadores[i]}>{n}{sala.jogadores[i] === s.uid ? ' (VOCE)' : ''}</li>)}
        </ul>
        <p className="dt-jogo-aviso" aria-live="polite">
          {erro ?? (faltam > 0 ? 'ESPERANDO JOGADORES...' : criei ? 'PRONTO: COMECE QUANDO QUISER' : `ESPERANDO ${sala.nomes[0]} COMECAR`)}
        </p>
        <div className="dt-jogo-botoes" data-opcoes>
          {criei && <button type="button" data-principal onClick={onComecar} disabled={ocupado || faltam > 0}>[Comecar]</button>}
          <button type="button" data-principal={!criei || undefined} onClick={() => s.sair(sala)} disabled={ocupado}>
            {criei ? '[Fechar sala]' : '[Sair da sala]'}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p className="dt-jogo-legenda">SALAS ABERTAS</p>
      {livres === null ? (
        <p>{erro ?? 'PROCURANDO...'}</p>
      ) : livres.length ? (
        <ul className="dt-online-lista" data-opcoes>
          {livres.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => s.entrar(l)} disabled={ocupado}>[Entrar]</button> {l.nomes[0]} ({l.jogadores.length}/{l.max})
            </li>
          ))}
        </ul>
      ) : (
        <p>NENHUMA SALA ABERTA</p>
      )}
      <p className="dt-jogo-aviso" aria-live="polite">{erro ?? `JOGANDO COMO ${s.nome}. SEM FICHAS: VALE O HISTORICO`}</p>
      <div className="dt-jogo-botoes" data-opcoes>
        <button type="button" data-principal onClick={s.criar} disabled={ocupado || livres === null}>[Criar sala]</button>
        <button type="button" onClick={onVoltar}>[Contra o bot]</button>
      </div>
    </>
  );
}
