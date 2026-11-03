import { useEffect, useState } from 'react';
import { ler } from '../crawler/memoria';
import { CHAVE_21, normalizarPlacar } from '../vinteum/regras';

// Placar de Lideres: recorde, mãos e vitórias de cada jogo. Lê o que os jogos guardam neste navegador e acompanha
// as gravações deles (o evento com o nome da chave; `storage`, de outra aba).
const ler21 = () => normalizarPlacar(ler(CHAVE_21));

export default function PlacarToy() {
  const [vinteUm, setVinteUm] = useState(ler21);

  useEffect(() => {
    const atualizar = () => setVinteUm(ler21());
    window.addEventListener(CHAVE_21, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(CHAVE_21, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);

  const taxa = vinteUm.maos ? Math.round((100 * vinteUm.vitorias) / vinteUm.maos) : 0;
  return (
    <div className="dt-placar">
      <table>
        <thead>
          <tr><th>JOGO</th><th>RECORDE</th><th>MAOS</th><th>VITORIAS</th></tr>
        </thead>
        <tbody>
          <tr><td>21</td><td>{vinteUm.recorde}</td><td>{vinteUm.maos}</td><td>{vinteUm.vitorias} ({taxa}%)</td></tr>
        </tbody>
      </table>
      <p className="dt-placar-nota">So neste navegador.</p>
    </div>
  );
}
