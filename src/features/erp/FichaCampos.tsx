import { Fragment, type CSSProperties, type ReactNode } from 'react';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import ListaItens from './ListaItens';
import { classeLargura, type Campo, type Linha, type Lista } from './camposFicha';

// Peças que desenham as fichas do ERP no layout do Elevor (rótulo em negrito à direita, controle ao lado, pares na mesma
// linha), a partir das definições de camposFicha.ts. Demonstração: os valores começam do exemplo e só ficam na tela.

export function Controle({ c, valor, especiais }: { c: Campo; valor: string; especiais: Record<string, ReactNode> }) {
  if (c.especial) return <>{especiais[c.especial]}</>;
  const larg = classeLargura(c);
  switch (c.tipo) {
    case 'caixa':
      return <label className="opcao"><input type="checkbox" defaultChecked={valor === 'Sim'} /> {c.rotulo}</label>;
    case 'radio':
      return (
        <div className="opcoes">
          {c.opcoes?.map((o) => <label key={o} className="opcao"><input type="radio" name={c.rotulo} defaultChecked={valor === o} /> {o}</label>)}
        </div>
      );
    case 'opcoes':
      return (
        <select {...larg} aria-label={c.rotulo} defaultValue={valor}>
          <option value="" />
          {c.opcoes?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'longo':
      return <textarea className="campo area" rows={3} aria-label={c.rotulo} defaultValue={valor} />;
    case 'data':
      return <input className="campo" type="date" aria-label={c.rotulo} defaultValue={valor} />;
    case 'numero': case 'moeda': case 'percentual':
      return (
        <span className="com-sufixo">
          <input {...larg} inputMode="decimal" aria-label={c.rotulo} defaultValue={valor} />
          {c.tipo === 'percentual' && <span className="muted">%</span>}
        </span>
      );
    default:
      return <input {...larg} aria-label={c.rotulo} defaultValue={valor} />;
  }
}

/** Uma linha da ficha: o primeiro par ocupa a linha toda quando está sozinho; o último par vai até o fim da linha. */
export function LinhaFicha({ linha, valores, especiais, rotulos = {} }: {
  linha: Linha; valores: Record<string, string>; especiais: Record<string, ReactNode>; rotulos?: Record<string, ReactNode>;
}) {
  const rotulo = (c: Campo, par: boolean) => (
    <div className={`fc-rotulo${par ? ' par' : ''}`}>{c.tipo === 'caixa' ? '' : c.especial && c.especial in rotulos ? rotulos[c.especial] : `${c.rotulo}:`}</div>
  );
  const celula = (grupo: Campo[], classe: string, estilo?: CSSProperties) => (
    <div className={`fc-controle${classe}`} style={estilo}>
      {grupo.map((c) => (
        <Fragment key={c.rotulo}>
          {c.anexo && <span className="fc-anexo">{c.anexo}</span>}
          <Controle c={c} valor={valores[c.rotulo] ?? ''} especiais={especiais} />
          {c.botoes}
          {c.ajuda && <span className="fc-ajuda" title={c.ajuda}><HelpOutlineIcon /></span>}
        </Fragment>
      ))}
    </div>
  );
  return (
    <div className="fc-linha">
      {linha[0][0].secao && <div className="fc-secao">{linha[0][0].secao}</div>}
      {linha.map((grupo, i) => (
        <Fragment key={grupo[0].rotulo}>
          {rotulo(grupo[0], i > 0)}
          {linha.length === 1 ? celula(grupo, ' largo')
            // O último par vai do seu lugar até o fim da linha (o CSS lê a coluna de início).
            : i === linha.length - 1 ? celula(grupo, ' resto', { '--inicio': 2 * i + 2 } as CSSProperties) : celula(grupo, '')}
        </Fragment>
      ))}
    </div>
  );
}

/** Lista da ficha com o título como seção. */
export function ListaFicha({ lista, inicial }: { lista: Lista; inicial?: string[][] }) {
  return (
    <>
      <div className="fc-secao">{lista.lista}</div>
      <div className="fc-lista">
        <ListaItens colunas={lista.colunas} estreita={lista.estreita} botao={lista.botao} inicial={inicial} />
      </div>
    </>
  );
}
