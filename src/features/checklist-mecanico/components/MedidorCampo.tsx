import { Alert, Checkbox, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { medidorAbaixoDoUltimo } from '../domain/regras';

const numero = (valor: number) => valor.toLocaleString('pt-BR');

/** KM ou horímetro com o último do cadastro à vista e, abaixo dele, a confirmação "Esse é o KM correto". */
export default function MedidorCampo({ horimetro, ultimo, texto, onTexto, corrigido, onCorrigido, erro, disabled }: {
  horimetro: boolean;
  ultimo: number | null;
  texto: string;
  onTexto: (texto: string) => void;
  corrigido: boolean;
  onCorrigido: (corrigido: boolean) => void;
  erro?: string | null;
  disabled?: boolean;
}) {
  const nome = horimetro ? 'Horímetro' : 'KM';
  const valor = texto === '' ? null : Number(texto);
  return (
    <Stack spacing={1}>
      <TextField
        label={nome}
        value={texto}
        disabled={disabled}
        onChange={(e) => onTexto(e.target.value.replace(/\D/g, ''))}
        error={Boolean(erro)}
        helperText={erro ?? (ultimo == null ? `Sem ${nome.toLowerCase()} anterior no cadastro.` : `Último ${nome}: ${numero(ultimo)}`)}
        slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', autoComplete: 'off' } }}
      />
      {ultimo != null && medidorAbaixoDoUltimo(valor, ultimo) && (
        <Alert severity="error" icon={false}>
          <Typography variant="body2">Menor que o último registrado ({numero(ultimo)}). Confira o valor.</Typography>
          <FormControlLabel
            sx={{ mt: 0.5, alignItems: 'flex-start' }}
            control={<Checkbox checked={corrigido} disabled={disabled} onChange={(e) => onCorrigido(e.target.checked)} sx={{ pt: 0.25 }} />}
            label={(
              <span>
                <strong>Esse é o {nome} correto</strong>
                <br />
                <Typography component="span" variant="body2">O cadastro do veículo será corrigido para este valor.</Typography>
              </span>
            )}
          />
        </Alert>
      )}
    </Stack>
  );
}
