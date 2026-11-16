import { useState } from 'react';
import { Modal } from '../ui/base.tsx';
import type { Coluna } from './tipos.ts';

// Google Agenda do quadro (config.agenda, decisão de 2026-11-16): a coluna de pessoa e a de Data/Período que viram
// eventos na agenda "Friday" de cada pessoa que conectou o Google Agenda em Meu perfil (Functions fridayAgenda*).
export type ConfigAgenda = { coluna_pessoa: number; coluna_data: number };

export function AgendaQuadro({ config, colunas, onSalvar, onFechar }: {
  config: Record<string, unknown> | undefined; colunas: Coluna[]; onSalvar: (agenda: ConfigAgenda | null) => void; onFechar: () => void;
}) {
  const atual = config?.agenda as Partial<ConfigAgenda> | undefined;
  const pessoas = colunas.filter(c => c.tipo === 'pessoa');
  const datas = colunas.filter(c => c.tipo === 'data' || c.tipo === 'periodo');
  const [pessoa, setPessoa] = useState<number | ''>(pessoas.some(c => c.id === atual?.coluna_pessoa) ? Number(atual?.coluna_pessoa) : '');
  const [data, setData] = useState<number | ''>(datas.some(c => c.id === atual?.coluna_data) ? Number(atual?.coluna_data) : '');
  const ligada = Boolean(atual?.coluna_pessoa && atual?.coluna_data);
  return (
    <Modal titulo="Google Agenda" largura={460} onClose={onFechar}>
      <form onSubmit={e => { e.preventDefault(); if (pessoa !== '' && data !== '') { onSalvar({ coluna_pessoa: pessoa, coluna_data: data }); onFechar(); } }}>
        <p className="muted fr-small">
          Cada item com data vira um evento na agenda “Friday” do Google Agenda das pessoas da coluna escolhida, para quem
          conectou o Google Agenda em Meu perfil. Período vira um evento de vários dias.
        </p>
        {!pessoas.length || !datas.length ? (
          <p className="fr-small">Este quadro precisa de uma coluna de Pessoa e de uma coluna de Data ou Período.</p>
        ) : (
          <>
            <label className="campo-form">Pessoa (quem recebe na agenda)
              <select className="input-cheio" value={pessoa} onChange={e => setPessoa(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Escolha a coluna</option>{pessoas.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
              </select>
            </label>
            <label className="campo-form">Data ou Período
              <select className="input-cheio" value={data} onChange={e => setData(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Escolha a coluna</option>{datas.map(c => <option key={c.id} value={c.id}>{c.titulo}</option>)}
              </select>
            </label>
          </>
        )}
        <div className="form-acoes">
          {ligada && <button type="button" className="fr-btn" onClick={() => { onSalvar(null); onFechar(); }}>Desligar</button>}
          <button type="button" className="fr-btn" onClick={onFechar}>Cancelar</button>
          <button className="fr-btn btn-primario" disabled={pessoa === '' || data === ''}>Salvar</button>
        </div>
      </form>
    </Modal>
  );
}
