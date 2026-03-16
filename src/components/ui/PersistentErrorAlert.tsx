import { Alert, Button, Stack } from '@mui/material';

interface PersistentErrorAlertProps {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export default function PersistentErrorAlert({ message, onRetry, onDismiss }: PersistentErrorAlertProps) {
  return (
    <Alert
      severity="error"
      action={
        <Stack direction="row" spacing={1}>
          {onRetry && (
            <Button color="inherit" size="small" onClick={onRetry}>
              Tentar novamente
            </Button>
          )}
          {onDismiss && (
            <Button color="inherit" size="small" onClick={onDismiss}>
              Fechar
            </Button>
          )}
        </Stack>
      }
    >
      {message}
    </Alert>
  );
}