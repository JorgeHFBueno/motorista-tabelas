import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import type { CivilDate } from '../domain/models';

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
