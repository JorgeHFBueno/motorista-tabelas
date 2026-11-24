import { useState } from 'react';
import { Alert, Button, Container, Snackbar, Stack } from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ListaItens from './ListaItens';
import { AVISO_DEMONSTRACAO, VENDEDORES_EXEMPLO } from './pessoasExemplo';

// /erp/vendedores: cadastro simples de Vendedores do ERP (nome, e-mail, comissão e ativo), usado na ficha de Clientes e
// Fornecedores. Demonstração: as linhas se editam na tela, e Salvar não grava nada.
export default function ErpVendedoresPage() {
  const [salvo, setSalvo] = useState(false);
  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Alert severity="info" sx={{ mb: 2 }}>{AVISO_DEMONSTRACAO}</Alert>
      <ListaItens
        titulo="Vendedores" botao="Novo vendedor" inicial={VENDEDORES_EXEMPLO}
        colunas={[{ rotulo: 'Nome', largura: 180 }, { rotulo: 'E-mail', largura: 200 }, { rotulo: 'Comissão (%)', largura: 90 }, { rotulo: 'Ativo', opcoes: ['Sim', 'Não'], largura: 80 }]}
      />
      <Stack direction="row" justifyContent="flex-end" mt={2}>
        <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={() => setSalvo(true)}>Salvar</Button>
      </Stack>
      <Snackbar open={salvo} autoHideDuration={4000} onClose={() => setSalvo(false)} message="Demonstração: nada foi gravado." />
    </Container>
  );
}
