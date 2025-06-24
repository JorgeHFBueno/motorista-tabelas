import { AppBar, Toolbar, Button, Stack } from '@mui/material';

export default function Header() {
  return (
    <AppBar position="static">
      <Toolbar>
        <Stack direction="row" spacing={2} sx={{ flexGrow: 1 }}>
          <Button color="inherit" href="#cliente">
            Cliente
          </Button>
          <Button color="inherit" href="#portifolio">
            Portifólio
          </Button>
        </Stack>
      </Toolbar>
    </AppBar>
  );
}