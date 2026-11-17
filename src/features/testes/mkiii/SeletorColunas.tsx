import { alternarColuna, COLUNAS_QUADRO, useColunasOcultas } from "./colunasVisiveis";

/** /testes/mkiii: "Colunas" no cartão de filtros do Cronograma; cada chip mostra ou esconde uma coluna da grade. */
export function SeletorColunas() {
  const ocultas = useColunasOcultas();
  const visiveis = COLUNAS_QUADRO.length - ocultas.size;
  return (
    <div className="co-status-filter qg-colunas" role="group" aria-label="Colunas da grade de Obra iniciada">
      <span>Colunas</span>
      <div className="co-status-chips">
        {COLUNAS_QUADRO.map((coluna) => {
          const ativa = !ocultas.has(coluna.id);
          return (
            <button key={coluna.id} type="button" className={`co-status-chip ${ativa ? "is-active" : ""}`} aria-pressed={ativa} disabled={ativa && visiveis === 1}
              title={ativa ? (visiveis === 1 ? "Pelo menos uma coluna fica visível" : `Esconder ${coluna.rotulo}`) : `Mostrar ${coluna.rotulo}`} onClick={() => alternarColuna(coluna.id)}>
              <i aria-hidden="true" />{coluna.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
