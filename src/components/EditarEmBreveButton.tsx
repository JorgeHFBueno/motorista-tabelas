import { Button, Tooltip, type ButtonProps } from '@mui/material';

interface EditarEmBreveButtonProps extends Omit<ButtonProps, 'disabled'> {
  tooltipText?: string;
}

export default function EditarEmBreveButton({
  tooltipText = 'Em breve',
  ...props
}: EditarEmBreveButtonProps) {
  return (
    <Tooltip title={tooltipText}>
      <span>
        <Button variant="outlined" disabled {...props}>
          Editar
        </Button>
      </span>
    </Tooltip>
  );
}