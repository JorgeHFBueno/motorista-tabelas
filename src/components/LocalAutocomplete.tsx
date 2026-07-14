import { Autocomplete, TextField, type TextFieldProps } from '@mui/material';
import { DESTINOS_OPTIONS } from '../constants/combustivel';

type LocalAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  error?: boolean;
  helperText?: TextFieldProps['helperText'];
  placeholder?: string;
  disabled?: boolean;
};

export default function LocalAutocomplete({
  value,
  onChange,
  label = 'Local',
  required = false,
  error = false,
  helperText,
  placeholder,
  disabled = false,
}: LocalAutocompleteProps) {
  return (
    <Autocomplete
      freeSolo
      options={DESTINOS_OPTIONS}
      value={value}
      onInputChange={(_, nextValue) => onChange(nextValue)}
      disabled={disabled}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={error}
          helperText={helperText}
          placeholder={placeholder}
          fullWidth
        />
      )}
      fullWidth
    />
  );
}
