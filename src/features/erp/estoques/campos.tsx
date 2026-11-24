import type { ReactNode } from 'react';
import { num, produtoExemplo, TIPOS_PRODUTO, type ProdutoExemplo } from './estoquesExemplo';

// Peças de formulário das telas de Estoques, como as do ERP do Samuel (web/src/ui/ui.tsx): linha "rótulo | controle" e
// grupo de opções (radio).

export function Linha({ rotulo, children, id }: { rotulo: string; children: ReactNode; id?: string }) {
  return (
    <div className="form-linha">
      {id ? <label className="form-rotulo" htmlFor={id}>{rotulo}</label> : <div className="form-rotulo">{rotulo}</div>}
      <div className="form-controle">{children}</div>
    </div>
  );
}

export function Opcoes<T extends string>({ nome, valor, opcoes, onChange }: {
  nome: string; valor: T; opcoes: ReadonlyArray<{ valor: T; rotulo: string }>; onChange: (v: T) => void;
}) {
  return (
    <div className="opcoes" role="radiogroup">
      {opcoes.map((o) => (
        <label key={o.valor} className="opcao">
          <input type="radio" name={nome} checked={valor === o.valor} onChange={() => onChange(o.valor)} /> {o.rotulo}
        </label>
      ))}
    </div>
  );
}

export const EtiquetaTipo = ({ produto }: { produto: ProdutoExemplo }) => (
  <span className={`etiqueta ${produto.tipo}`}>{TIPOS_PRODUTO[produto.tipo]}</span>
);

export type LinhaDivergencia = { contagem?: number; produto: number; quantidade: number; sistema: number; diferenca: number };

// "Listar Divergentes" / "Listar não Divergentes" das contagens (CL_Volumes e CD_Volumes): contado × saldo do sistema na data.
export function TabelaDivergencias({ titulo, linhas, comContagem = false }: { titulo: string; linhas: LinhaDivergencia[]; comContagem?: boolean }) {
  const colunas = comContagem ? 7 : 6;
  return (
    <>
      <div className="grade-titulo">{titulo}</div>
      <table className="grade compacta">
        <thead>
          <tr>
            {comContagem && <th className="num">Contagem</th>}
            <th className="num">Cod</th><th>Produto</th><th>UN</th><th className="num">Estoque</th><th className="num">Contado</th><th className="num">Diferença</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => {
            const p = produtoExemplo(l.produto);
            return (
              <tr key={`${l.contagem ?? ''}-${l.produto}`}>
                {comContagem && <td className="num">{l.contagem}</td>}
                <td className="num">{l.produto}</td><td>{p?.descricao}</td><td>{p?.unidade}</td>
                <td className={`num${l.sistema < 0 ? ' negativo' : ''}`}>{num(l.sistema)}</td>
                <td className="num">{num(l.quantidade)}</td>
                <td className={`num${l.diferenca < 0 ? ' negativo' : ''}`}>{l.diferenca > 0 ? '+' : ''}{num(l.diferenca)}</td>
              </tr>
            );
          })}
          {!linhas.length && <tr><td colSpan={colunas} className="vazio">Nenhum produto.</td></tr>}
        </tbody>
      </table>
    </>
  );
}
