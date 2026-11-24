import { useState } from 'react';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

// Lista da ficha (telefones, e-mails, contatos, sócios...) como as do ERP/Elevor: "Adicionar" no alto, a linha mostra os
// valores, o lápis abre a edição e a lixeira tira. `estreita` (Telefone(s), E-mail(s)): botão no centro, sem cabeçalho.
// Demonstração: as linhas ficam só na tela.
export type ColunaItem = { rotulo: string; opcoes?: string[]; data?: true };

const dataBr = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v);

export default function ListaItens({ colunas, inicial = [], botao = 'Adicionar', estreita = false }: {
  colunas: ColunaItem[]; inicial?: string[][]; botao?: string; estreita?: boolean;
}) {
  const [linhas, setLinhas] = useState(inicial);
  const [editando, setEditando] = useState<number | null>(null);
  const mudar = (i: number, j: number, valor: string) =>
    setLinhas((ls) => ls.map((l, k) => (k === i ? colunas.map((_, m) => (m === j ? valor : l[m] ?? '')) : l)));

  return (
    <div className={`lista-itens${estreita ? ' estreita' : ''}`}>
      <div className={estreita ? 'botoes-centro' : 'botoes-direita'}>
        <button type="button" className="btn" onClick={() => { setLinhas((ls) => [...ls, colunas.map(() => '')]); setEditando(linhas.length); }}>
          <AddCircleOutlineIcon /> {botao}
        </button>
      </div>
      <table className="grade compacta">
        {!estreita && colunas.length > 1 && (
          <thead><tr>{colunas.map((c) => <th key={c.rotulo}>{c.rotulo}</th>)}<th /></tr></thead>
        )}
        <tbody>
          {linhas.map((linha, i) => (
            <tr key={i}>
              {colunas.map((c, j) => (
                <td key={c.rotulo}>
                  {editando !== i ? (c.data ? dataBr(linha[j] ?? '') : linha[j]) : c.opcoes ? (
                    <select className="campo curto" aria-label={c.rotulo} value={linha[j] ?? ''} onChange={(e) => mudar(i, j, e.target.value)}>
                      <option value="" />
                      {c.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input className={`campo ${c.data ? '' : 'medio'}`} type={c.data ? 'date' : 'text'} aria-label={c.rotulo} value={linha[j] ?? ''}
                      autoFocus={j === 0} onChange={(e) => mudar(i, j, e.target.value)} />
                  )}
                </td>
              ))}
              <td className="acoes-linha">
                <button type="button" className="link-botao" title="Editar" aria-label="Editar" onClick={() => setEditando(editando === i ? null : i)}><EditOutlinedIcon /></button>
                <button type="button" className="link-botao" title="Tirar" aria-label="Tirar"
                  onClick={() => { setLinhas((ls) => ls.filter((_, k) => k !== i)); setEditando(null); }}><DeleteOutlineIcon /></button>
              </td>
            </tr>
          ))}
          {!linhas.length && <tr><td colSpan={colunas.length + 1} className="vazio">Nenhum item.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
