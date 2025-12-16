import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  TextField,
  type ButtonProps,
} from '@mui/material';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

interface CadastroVeiculoFormProps {
  buttonLabel?: string;
  buttonVariant?: ButtonProps['variant'];
  fullWidthButton?: boolean;
  onSaved?: () => void;
  disabled?: boolean;
}

/**
 * Formulário reutilizável para cadastro de veículos/placas.
 * Mantém o mesmo comportamento que existia na página de Frota e salva na coleção
 * "01-placas" do Firestore.
 */
export default function CadastroVeiculoForm({
  buttonLabel = 'Cadastrar veículo',
  buttonVariant = 'contained',
  fullWidthButton,
  onSaved,
  disabled,
}: CadastroVeiculoFormProps) {
  const [dialogAberto, setDialogAberto] = useState(false);
  const [tipoPlaca, setTipoPlaca] = useState<'normal' | 'diversos'>('normal');
  const [placaValor, setPlacaValor] = useState('');
  const [kmValor, setKmValor] = useState('');
  const [extraValor, setExtraValor] = useState('');
  const [salvandoPlaca, setSalvandoPlaca] = useState(false);
  const [snackbar, setSnackbar] = useState<
    { message: string; severity: 'success' | 'error' } | null
  >(null);
  const [errosFormulario, setErrosFormulario] = useState<{
    placa?: string;
    km?: string;
    extra?: string;
  }>({});

  const handleAbrirDialog = () => {
    setDialogAberto(true);
    setErrosFormulario({});
  };

  const limparFormulario = () => {
    setTipoPlaca('normal');
    setPlacaValor('');
    setKmValor('');
    setExtraValor('');
    setErrosFormulario({});
  };

  const handleFecharDialog = () => {
    setDialogAberto(false);
    setSalvandoPlaca(false);
    limparFormulario();
  };

  const handleSalvarPlaca = async () => {
    if (salvandoPlaca) return;
    const erros: { placa?: string; km?: string; extra?: string } = {};

    const placaNormalizada = placaValor.trim().toUpperCase();
    const kmNumero = Number(kmValor);
    const extraNormalizado = extraValor.trim();

    if (tipoPlaca === 'normal') {
      if (!placaNormalizada) {
        erros.placa = 'Informe a placa';
      }
      if (!Number.isFinite(kmNumero) || kmNumero <= 0) {
        erros.km = 'Informe o KM (maior que 0)';
      }
    } else {
      if (!extraNormalizado) {
        erros.extra = 'Descreva o uso';
      }
    }

    if (Object.keys(erros).length > 0) {
      setErrosFormulario(erros);
      return;
    }

    setSalvandoPlaca(true);

    try {
      let payload: any;

      if (tipoPlaca === 'diversos') {
        // Só manda o campo "extra" para o BD
        payload = {
          extra: extraNormalizado,
        };
      } else {
        // tipoPlaca === 'normal'
        payload = {
          placa: placaNormalizada,
          km: kmNumero,
          extra: '',
        };
      }

      await addDoc(collection(db, '01-placas'), payload);

      setSnackbar({ message: 'Placa cadastrada com sucesso', severity: 'success' });
      handleFecharDialog();
      onSaved?.();
    } catch (error) {
      console.error('Erro ao cadastrar placa', error);
      setSnackbar({ message: 'Erro ao cadastrar placa', severity: 'error' });
      setSalvandoPlaca(false);
    }
  };

  const triggerProps = useMemo(() => ({
    variant: buttonVariant,
    onClick: handleAbrirDialog,
    disabled: disabled || salvandoPlaca,
    fullWidth: fullWidthButton,
  }), [buttonVariant, disabled, salvandoPlaca, fullWidthButton]);

  return (
    <>
      <Button {...triggerProps}>
        {buttonLabel}
      </Button>
      <Dialog open={dialogAberto} onClose={handleFecharDialog} fullWidth maxWidth="sm">
        <DialogTitle>Cadastrar placa</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} mt={1}>
            <RadioGroup
              row
              value={tipoPlaca}
              onChange={(_event, value) => setTipoPlaca(value as 'normal' | 'diversos')}
            >
              <FormControlLabel value="normal" control={<Radio />} label="Normal" />
              <FormControlLabel value="diversos" control={<Radio />} label="Diversos" />
            </RadioGroup>

            {tipoPlaca === 'normal' && (
              <TextField
                label="Placa"
                value={placaValor}
                onChange={(event) => setPlacaValor(event.target.value)}
                error={Boolean(errosFormulario.placa)}
                helperText={errosFormulario.placa}
                inputProps={{ style: { textTransform: 'uppercase' } }}
              />
            )}

            {tipoPlaca === 'normal' ? (
              <TextField
                label="KM"
                type="number"
                value={kmValor}
                onChange={(event) => setKmValor(event.target.value)}
                error={Boolean(errosFormulario.km)}
                helperText={errosFormulario.km}
              />
            ) : (
              <TextField
                label="Extra"
                value={extraValor}
                onChange={(event) => setExtraValor(event.target.value)}
                error={Boolean(errosFormulario.extra)}
                helperText={errosFormulario.extra}
                multiline
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleFecharDialog} disabled={salvandoPlaca}>
            Cancelar
          </Button>
          <Button onClick={handleSalvarPlaca} variant="contained" disabled={salvandoPlaca}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
      {snackbar && (
        <Snackbar
          open={Boolean(snackbar)}
          autoHideDuration={4000}
          onClose={() => setSnackbar(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          {snackbar && (
            <Alert
              onClose={() => setSnackbar(null)}
              severity={snackbar.severity}
              sx={{ width: '100%' }}
            >
              {snackbar.message}
            </Alert>
          )}
        </Snackbar>
      )}
    </>
  );
}