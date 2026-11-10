import { CartaPtView } from './CartaPtView';
import {
  HAB_NOME, MAX_ESPECIAIS, MIN_UNIDADES, colecaoDe, contagem, liderPorId, lideresDe, problemasDo, type Baralho, type Carta, type Modelo,
} from './cartas';

// Montar o baralho (como no Witcher 3): o líder (um dos 5 da facção) e as cartas, da coleção (as unidades da
// facção, as neutras e as especiais) para o baralho e de volta, uma cópia por clique. No mínimo 22 unidades, no
// máximo 10 especiais; cada carta até o máximo de cópias dela. Quem grava é a janela do jogo.

const cartaDe = (m: Modelo, k: number): Carta => ({ id: k, nome: m.nome, tipo: m.tipo, fileira: m.fileira, forca: m.forca, hab: m.hab, heroi: m.heroi });
const descricao = (m: Modelo) => [m.tipo === 'unidade' ? `${m.forca}` : '', m.heroi ? 'ROOT' : '', m.hab ? HAB_NOME[m.hab] : ''].filter(Boolean).join(' ');

export function MontarBaralho({ baralho, onMudar }: { baralho: Baralho; onMudar: (b: Baralho) => void }) {
  const colecao = colecaoDe(baralho.faccao);
  const c = contagem(baralho);
  const problemas = problemasDo(baralho);
  const lider = liderPorId(baralho.lider);
  const mudar = (nome: string, delta: number) => {
    const m = colecao.find((x) => x.nome === nome)!;
    const n = Math.max(0, Math.min(m.max, (baralho.cartas[nome] ?? 0) + delta));
    const cartas = { ...baralho.cartas, [nome]: n };
    if (!n) delete cartas[nome];
    onMudar({ ...baralho, cartas });
  };

  const lista = (noBaralho: boolean) =>
    colecao.map((m, k) => {
      const tem = baralho.cartas[m.nome] ?? 0;
      const n = noBaralho ? tem : m.max - tem;
      if (!n) return null;
      return (
        <button
          key={m.nome}
          type="button"
          className="dt-pt-montar-carta"
          aria-label={`${noBaralho ? 'Tirar do baralho' : 'Por no baralho'} ${m.nome} ${descricao(m)}, ${n} ${noBaralho ? 'no baralho' : 'sobrando'}`}
          onClick={() => mudar(m.nome, noBaralho ? -1 : 1)}
        >
          <CartaPtView carta={cartaDe(m, k)} />
          <span className="dt-pt-montar-qtd">X{n}</span>
        </button>
      );
    });

  return (
    <div className="dt-pt-montar">
      <div className="dt-jogo-botoes dt-pt-escolha" data-opcoes>
        LIDER
        {lideresDe(baralho.faccao).map((l) => (
          <button key={l.id} type="button" className={l.id === baralho.lider ? 'dt-jogo-escolhida' : undefined} aria-pressed={l.id === baralho.lider} onClick={() => onMudar({ ...baralho, lider: l.id })}>
            [{l.nome}]
          </button>
        ))}
      </div>
      <p className="dt-pt-contas">{lider.nome}: {lider.texto}</p>
      <p className="dt-pt-montar-conta">
        <span className={c.unidades < MIN_UNIDADES ? 'dt-neo-vermelho' : undefined}>UNIDADES {c.unidades} (MIN {MIN_UNIDADES})</span>
        <span className={c.especiais > MAX_ESPECIAIS ? 'dt-neo-vermelho' : undefined}>ESPECIAIS {c.especiais}/{MAX_ESPECIAIS}</span>
        <span>HEROIS {c.herois}</span>
        <span>FORCA {c.forca}</span>
        <span>CARTAS {c.total}</span>
      </p>
      {problemas.length > 0 && <p className="dt-neo-vermelho">{problemas.join(' . ')}</p>}
      <div className="dt-pt-montar-colunas">
        <section>
          <p className="dt-jogo-legenda">COLECAO (CLIQUE PARA POR)</p>
          <div className="dt-pt-montar-grade" data-opcoes>{lista(false)}</div>
        </section>
        <section>
          <p className="dt-jogo-legenda">BARALHO (CLIQUE PARA TIRAR)</p>
          <div className="dt-pt-montar-grade" data-opcoes>{lista(true)}</div>
        </section>
      </div>
    </div>
  );
}
