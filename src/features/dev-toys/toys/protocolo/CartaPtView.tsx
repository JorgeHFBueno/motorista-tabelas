import { HAB_NOME, ehHeroi, nomeDaCartaPt, type Carta, type Fileira } from './regras';

// Carta do PROTOCOLO, pequena: força (invertida no herói; acesa se subiu no campo, vermelha se caiu) e o ícone da
// fileira em cima, o nome no meio, a habilidade embaixo. Especiais mostram o que fazem. Ícones em pixels (7×7).
const ICONE: Record<Fileira | 'agil', string> = {
  // chip com pinos
  cpu: 'M1 1h5v1H1zM1 5h5v1H1zM1 2h1v3H1zM5 2h1v3H5zM3 3h1v1H3zM0 2h1v1H0zM0 4h1v1H0zM6 2h1v1H6zM6 4h1v1H6zM2 0h1v1H2zM4 0h1v1H4zM2 6h1v1H2zM4 6h1v1H4z',
  // antena
  rede: 'M3 3h1v4H3zM2 2h3v1H2zM1 1h1v1H1zM5 1h1v1H5zM0 0h1v1H0zM6 0h1v1H6z',
  // disco
  disco: 'M1 0h5v1H1zM0 1h1v5H0zM6 1h1v5H6zM1 6h5v1H1zM1 2h5v1H1zM4 4h1v1H4z',
  // duas setas: CPU ou REDE
  agil: 'M0 3h7v1H0zM1 2h1v1H1zM1 4h1v1H1zM5 2h1v1H5zM5 4h1v1H5z',
};

export function IconeFileira({ f }: { f: Fileira | 'agil' }) {
  return (
    <svg className="dt-pt-icone" viewBox="0 0 7 7" aria-hidden="true" shapeRendering="crispEdges">
      <path d={ICONE[f]} />
    </svg>
  );
}

const ESPECIAL: Record<string, string> = {
  clima: 'CLIMA',
  reboot: 'LIMPA O CLIMA',
  overclock: 'DOBRA A FILEIRA',
  kill: 'MATA A MAIS FORTE',
  ctrlz: 'VOLTA PARA A MAO',
};

/** `forca`: a força no campo (sem ela, a impressa). */
export function CartaPtView({ carta, forca }: { carta: Carta; forca?: number }) {
  const unidade = carta.tipo === 'unidade';
  const heroi = ehHeroi(carta);
  const v = forca ?? carta.forca;
  const classeForca = heroi ? 'dt-pt-forca dt-pt-heroi' : v > carta.forca ? 'dt-pt-forca dt-pt-mais' : v < carta.forca ? 'dt-pt-forca dt-pt-menos' : 'dt-pt-forca';
  return (
    <div className={unidade ? 'dt-pt-carta' : 'dt-pt-carta dt-pt-especial'} role="img" aria-label={forca !== undefined && unidade ? `${nomeDaCartaPt(carta)}, vale ${v}` : nomeDaCartaPt(carta)}>
      <span className="dt-pt-topo">
        {unidade ? <b className={classeForca}>{v}</b> : <b className="dt-pt-forca">*</b>}
        {carta.fileira && <IconeFileira f={carta.fileira} />}
      </span>
      <span className="dt-pt-nome">{carta.nome}</span>
      <span className="dt-pt-hab">{carta.hab ? HAB_NOME[carta.hab] : carta.fileira === 'agil' ? 'AGIL' : unidade ? '' : ESPECIAL[carta.tipo]}</span>
    </div>
  );
}
