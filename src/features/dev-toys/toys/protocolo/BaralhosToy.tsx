import { useOpcoesTeclado } from '../fichas/hooks';
import { useBaralhos } from './baralhos';
import { FACCOES, PASSIVA, baralhoPadrao, type Baralho } from './cartas';
import { MontarBaralho } from './MontarBaralho';

// Setor Baralhos: monta os baralhos do PROTOCOLO, um por facção (a escolhida aqui é a que o PROTOCOLO usa).
// Fica fora do jogo para crescer sozinho depois (coleção, cartas a ganhar).
export default function BaralhosToy() {
  const [guardado, salvar] = useBaralhos();
  const { faccao, baralhos } = guardado;
  const { raiz, teclas } = useOpcoesTeclado(faccao);
  const mudar = (b: Baralho) => salvar({ ...guardado, baralhos: { ...baralhos, [b.faccao]: b } });
  return (
    <div className="dt-pt-baralhos dt-jogo" ref={raiz} tabIndex={-1} onKeyDown={teclas}>
      <div className="dt-jogo-botoes dt-pt-escolha" data-opcoes>
        FACCAO
        {FACCOES.map((f) => (
          <button
            key={f}
            type="button"
            className={faccao === f ? 'dt-jogo-escolhida' : undefined}
            aria-pressed={faccao === f}
            data-principal={faccao === f || undefined}
            onClick={() => salvar({ ...guardado, faccao: f })}
          >
            [{f}]
          </button>
        ))}
        <button type="button" onClick={() => mudar(baralhoPadrao(faccao))}>[Padrao]</button>
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('ledur:dev-abrir', { detail: 'protocolo' }))}>[Jogar PROTOCOLO]</button>
      </div>
      <p className="dt-pt-contas">{faccao}: {PASSIVA[faccao]}</p>
      <MontarBaralho baralho={baralhos[faccao]} onMudar={mudar} />
    </div>
  );
}
