// Rodapé das grades do ERP como o do Elevor: linha em cima, "Registros:" à esquerda e as páginas em grupo à direita.
export default function Paginacao({ total, pagina, porPagina, onPagina, onPorPagina }: {
  total: number; pagina: number; porPagina: number; onPagina: (n: number) => void; onPorPagina: (n: number) => void;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <div className="paginacao">
      <span>Registros:</span>
      <select className="campo" aria-label="Registros por página" value={porPagina} onChange={(e) => onPorPagina(Number(e.target.value))}>
        {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <div className="paginas">
        {Array.from({ length: paginas }, (_, i) => (
          <button key={i} type="button" className={`pg${i === pagina ? ' atual' : ''}`} aria-current={i === pagina ? 'page' : undefined}
            onClick={() => onPagina(i)}>{i + 1}</button>
        ))}
      </div>
    </div>
  );
}
