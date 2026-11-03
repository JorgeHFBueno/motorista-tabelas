import { useEffect, useState } from 'react';
import { useCarteira } from '../fichas/hooks';
import { JOGOS, lerPlacar, taxaDeVitorias } from '../fichas/jogos';

// Placar de Lideres: a carteira (fichas, recorde, mesadas) e, por jogo, jogadas, vitórias e o maior prêmio. Lê o que
// fica neste navegador e acompanha as gravações (o evento com o nome de cada chave; `storage`, de outra aba).
const lerTodos = () => JOGOS.map((j) => ({ ...j, placar: lerPlacar(j.chave) }));

export default function PlacarToy() {
  const carteira = useCarteira();
  const [jogos, setJogos] = useState(lerTodos);

  useEffect(() => {
    const atualizar = () => setJogos(lerTodos());
    for (const j of JOGOS) window.addEventListener(j.chave, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      for (const j of JOGOS) window.removeEventListener(j.chave, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);

  return (
    <div className="dt-placar">
      <p className="dt-placar-carteira">
        FICHAS {carteira.fichas} . RECORDE {carteira.recorde}{carteira.mesadas ? ` . MESADAS ${carteira.mesadas}` : ''}
      </p>
      <table>
        <thead>
          <tr><th>JOGO</th><th>JOGADAS</th><th>VITORIAS</th><th>MAIOR PREMIO</th></tr>
        </thead>
        <tbody>
          {jogos.map(({ chave, nome, placar }) => (
            <tr key={chave}>
              <td>{nome}</td>
              <td>{placar.jogadas}</td>
              <td>{placar.vitorias} ({taxaDeVitorias(placar)}%)</td>
              <td>{placar.maiorPremio ? `+${placar.maiorPremio}` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dt-placar-nota">So neste navegador.</p>
    </div>
  );
}
