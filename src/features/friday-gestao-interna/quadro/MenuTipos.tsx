import { useState } from 'react';
import { Search } from 'lucide-react';
import { corTexto } from '../util.ts';
import { TIPOS, type TipoColuna } from './tipos.ts';

// Escolha do tipo de uma coluna nova (com busca sem diferenciar acentos: "formula" acha "Fórmula").
export function MenuTipos({ onEscolher }: { onEscolher: (t: TipoColuna) => void }) {
  const [busca, setBusca] = useState('');
  const sa = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const b = sa(busca.trim());
  const filtrados = TIPOS.filter(t => !b || sa(`${t.rotulo} ${t.descricao} ${t.busca ?? ''}`).includes(b));
  const secao = (titulo: string, lista: typeof TIPOS) => lista.length > 0 && (
    <>
      <div className="menu-titulo">{titulo}</div>
      <div className="grade-tipos">
        {lista.map(t => (
          <button key={t.tipo} className="tipo-btn" onClick={() => onEscolher(t.tipo)} title={t.descricao}>
            <span className="tipo-ic" style={{ background: t.cor, color: corTexto(t.cor) }}><t.icone size={14} /></span>{t.rotulo}
          </button>
        ))}
      </div>
    </>
  );
  return (
    <div className="menu-tipos">
      <label className="busca-tipos"><Search size={15} /><input autoFocus placeholder="Buscar ou descrever a coluna" value={busca} onChange={e => setBusca(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && filtrados[0]) onEscolher(filtrados[0].tipo); }} /></label>
      {b ? secao('Resultados', filtrados) : <>{secao('Essenciais', filtrados.filter(t => t.grupo === 'essencial'))}{secao('Muito úteis', filtrados.filter(t => t.grupo === 'util'))}</>}
      {!filtrados.length && <p className="muted fr-small" style={{ padding: '4px 10px 8px' }}>Nenhum tipo de coluna encontrado.</p>}
    </div>
  );
}
