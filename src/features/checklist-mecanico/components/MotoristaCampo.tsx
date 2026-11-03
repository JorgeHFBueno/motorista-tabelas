import { Autocomplete, TextField } from '@mui/material';
import { useState } from 'react';
import { resolverMotorista, type ChecklistMotorista } from '../domain/rascunho';

/** Motorista/operador: escolhe da lista de quem tem a credencial `motorista` ou digita o nome (fica sem uid). */
export default function MotoristaCampo({ motoristas, valor, onChange, erro, disabled }: {
  motoristas: readonly ChecklistMotorista[];
  valor: ChecklistMotorista | null;
  onChange: (motorista: ChecklistMotorista | null) => void;
  erro?: string | null;
  disabled?: boolean;
}) {
  const [texto, setTexto] = useState(valor?.nome ?? '');
  const aviso = erro ?? (valor != null && valor.uid == null ? 'Sem cadastro: fica gravado só o nome.' : ' ');

  const alterar = (novoTexto: string) => {
    setTexto(novoTexto);
    const novo = resolverMotorista(novoTexto, motoristas);
    if (novo?.uid !== valor?.uid || novo?.nome !== valor?.nome) onChange(novo);
  };

  return (
    <Autocomplete
      freeSolo
      disabled={disabled}
      options={motoristas.map((m) => m.nome)}
      inputValue={texto}
      onInputChange={(_, novo) => alterar(novo)}
      renderInput={(params) => (
        <TextField {...params} label="Motorista / Operador" error={Boolean(erro)} helperText={aviso} autoComplete="off" />
      )}
    />
  );
}
