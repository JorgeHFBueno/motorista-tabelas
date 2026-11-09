import Autocomplete from '@mui/material/Autocomplete';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import type { CivilDate } from '../domain/models';
import { COR_SEM_STATUS, STATUS_LOGISTICA, etiquetaDoStatus } from '../domain/status';

export interface Opcao { id: string; nome: string }

/** Texto que grava ao sair do campo ou no Enter; Esc desfaz. */
export function CampoTexto({ valor, onSalvar, placeholder, obrigatorio = false, maximo, className = '' }: {
  valor: string;
  onSalvar: (valor: string) => void;
  placeholder?: string;
  obrigatorio?: boolean;
  maximo: number;
  className?: string;
}) {
  const [rascunho, setRascunho] = useState(valor);
  useEffect(() => setRascunho(valor), [valor]);
  const salvar = () => {
    const limpo = rascunho.trim();
    if (limpo === valor) return;
    if (obrigatorio && !limpo) { setRascunho(valor); return; }
    onSalvar(limpo);
  };
  return (
    <input
      className={`lg-input ${className}`}
      value={rascunho}
      maxLength={maximo}
      placeholder={placeholder}
      onChange={(event) => setRascunho(event.target.value)}
      onBlur={salvar}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') { setRascunho(valor); event.currentTarget.blur(); }
      }}
    />
  );
}

/** De/até; o "até" não aceita data antes do "de". */
export function CampoPeriodo({ inicio, fim, onSalvar }: {
  inicio: CivilDate | null;
  fim: CivilDate | null;
  onSalvar: (periodo: { inicio: CivilDate | null; fim: CivilDate | null }) => void;
}) {
  return (
    <span className="lg-periodo">
      <input
        type="date"
        className="lg-input lg-data"
        aria-label="De"
        value={inicio ?? ''}
        onChange={(event) => {
          const novo = event.target.value || null;
          onSalvar({ inicio: novo, fim: novo && fim && fim < novo ? novo : fim });
        }}
      />
      <span className="lg-ate">a</span>
      <input
        type="date"
        className="lg-input lg-data"
        aria-label="Até"
        value={fim ?? ''}
        min={inicio ?? undefined}
        onChange={(event) => {
          const novo = event.target.value || null;
          onSalvar({ inicio: novo && inicio && novo < inicio ? novo : inicio, fim: novo });
        }}
      />
    </span>
  );
}

/** Escolha num cadastro, com busca. O valor atual entra nas opções mesmo que tenha saído do cadastro. */
export function CampoEscolha({ valor, opcoes, onSalvar, rotulo }: {
  valor: Opcao | null;
  opcoes: readonly Opcao[];
  onSalvar: (valor: Opcao | null) => void;
  rotulo: string;
}) {
  const lista = valor && !opcoes.some((opcao) => opcao.id === valor.id) ? [valor, ...opcoes] : opcoes;
  return (
    <Autocomplete
      size="small"
      className="lg-escolha"
      options={lista}
      value={valor}
      getOptionLabel={(opcao) => opcao.nome}
      isOptionEqualToValue={(opcao, atual) => opcao.id === atual.id}
      onChange={(_event, novo) => onSalvar(novo)}
      noOptionsText="Nada encontrado"
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder="—"
          slotProps={{ input: { ...params.InputProps, disableUnderline: true }, htmlInput: { ...params.inputProps, 'aria-label': rotulo } }}
        />
      )}
    />
  );
}

/** Vários itens de um cadastro (os veículos), sem repetir, até `maximo`. Os que saíram do cadastro continuam visíveis. */
export function CampoEscolhaVarios({ valores, opcoes, onSalvar, rotulo, maximo }: {
  valores: readonly Opcao[];
  opcoes: readonly Opcao[];
  onSalvar: (valores: Opcao[]) => void;
  rotulo: string;
  maximo: number;
}) {
  const fora = valores.filter((valor) => !opcoes.some((opcao) => opcao.id === valor.id));
  const cheio = valores.length >= maximo;
  return (
    <Autocomplete
      multiple
      size="small"
      className="lg-escolha lg-escolha-varios"
      options={[...fora, ...opcoes]}
      value={[...valores]}
      disableCloseOnSelect
      filterSelectedOptions
      getOptionLabel={(opcao) => opcao.nome}
      getOptionDisabled={() => cheio}
      isOptionEqualToValue={(opcao, atual) => opcao.id === atual.id}
      onChange={(_event, novos) => onSalvar(novos.slice(0, maximo))}
      noOptionsText={cheio ? `No máximo ${maximo}` : 'Nada encontrado'}
      renderValue={(selecionados, getItemProps) => selecionados.map((opcao, indice) => {
        const { key, onDelete } = getItemProps({ index: indice });
        return (
          <span key={key} className="lg-etiqueta-cadastro" title={opcao.nome}>
            <span>{opcao.nome}</span>
            <button type="button" aria-label={`Tirar ${opcao.nome}`} onClick={onDelete} tabIndex={-1}>×</button>
          </span>
        );
      })}
      renderInput={(params) => (
        <TextField
          {...params}
          variant="standard"
          placeholder={valores.length ? '' : '—'}
          slotProps={{ input: { ...params.InputProps, disableUnderline: true }, htmlInput: { ...params.inputProps, 'aria-label': rotulo } }}
        />
      )}
    />
  );
}

/** Etiqueta colorida do status; o clique abre a grade de etiquetas (como no Monday). */
export function CampoStatus({ valor, onSalvar, grande = false }: { valor: string; onSalvar: (valor: string) => void; grande?: boolean }) {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  const atual = etiquetaDoStatus(valor);
  const escolher = (novo: string) => { setAncora(null); if (novo !== valor) onSalvar(novo); };
  return (
    <>
      <button
        type="button"
        className={`lg-status${grande ? ' lg-status-grande' : ''}${atual.textoEscuro ? ' is-escuro' : ''}`}
        style={{ background: atual.cor }}
        onClick={(event) => setAncora(event.currentTarget)}
        aria-label={`Status: ${valor || 'sem status'}`}
        aria-haspopup="dialog"
      >
        {valor}
      </button>
      <Popover
        open={ancora !== null}
        anchorEl={ancora}
        onClose={() => setAncora(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { className: 'lg-status-menu' } }}
      >
        <div className="lg-status-grade" role="listbox" aria-label="Status">
          {STATUS_LOGISTICA.map((etiqueta) => (
            <button
              key={etiqueta.nome}
              type="button"
              role="option"
              aria-selected={etiqueta.nome === valor}
              className={`lg-status${etiqueta.textoEscuro ? ' is-escuro' : ''}${etiqueta.nome === valor ? ' is-atual' : ''}`}
              style={{ background: etiqueta.cor }}
              onClick={() => escolher(etiqueta.nome)}
            >
              {etiqueta.nome}
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={valor === ''}
            className={`lg-status${valor === '' ? ' is-atual' : ''}`}
            style={{ background: COR_SEM_STATUS }}
            onClick={() => escolher('')}
            aria-label="Sem status"
            title="Sem status"
          />
        </div>
      </Popover>
    </>
  );
}
