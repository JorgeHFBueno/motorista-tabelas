import { useState, type ReactNode } from 'react';
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import AreaChartOutlinedIcon from '@mui/icons-material/AreaChartOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import WidgetsOutlinedIcon from '@mui/icons-material/WidgetsOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ContactsOutlinedIcon from '@mui/icons-material/ContactsOutlined';
import MailOutlineOutlinedIcon from '@mui/icons-material/MailOutlineOutlined';
import Corvo from '../../components/corvo/Corvo';

// /erp (2026-11-24): início do ERP próprio, com o mosaico de atalhos da tela inicial do Elevor (ERP360), que inspirou o
// ERP próprio: mesmos blocos, posições e tamanhos, nas cores da Ledur (o roxo do Elevor virou azul-marinho). Os módulos
// ainda não chegaram: cada bloco abre o aviso "Estamos trabalhando nisso".
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

// Cores do src/theme/ledurTheme.ts; texto escuro onde o fundo é claro.
const CORES = {
  financeiro: { fundo: '#E79A25', texto: '#12293B' }, // amarelo do Elevor → âmbar (warning)
  painel: { fundo: '#12293B', texto: '#FFFFFF' }, // roxo do Elevor → azul-marinho
  comercial: { fundo: '#2E9D6F', texto: '#FFFFFF' },
  estoque: { fundo: '#2F6B98', texto: '#FFFFFF' },
  cadastro: { fundo: '#5B5D5B', texto: '#FFFFFF' },
  relatorio: { fundo: '#DDE3E8', texto: '#12293B' },
  mensagens: { fundo: '#4E83AA', texto: '#FFFFFF' },
} as const;

// Posição na grade de 5 colunas (coluna, linha, a partir de 1); `alto` ocupa duas linhas. Na ordem do Elevor, coluna a coluna.
type Bloco = { rotulo: string; icone: ReactNode; cor: keyof typeof CORES; coluna: number; linha: number; alto?: true };

const BLOCOS: Bloco[] = [
  { rotulo: 'Bancos/Caixa', icone: <PaidOutlinedIcon />, cor: 'financeiro', coluna: 1, linha: 1 },
  { rotulo: 'Lançamento de Títulos', icone: <AttachMoneyOutlinedIcon />, cor: 'financeiro', coluna: 1, linha: 2 },
  { rotulo: 'Consulta Títulos', icone: <AttachMoneyOutlinedIcon />, cor: 'financeiro', coluna: 1, linha: 3 },
  { rotulo: 'Conciliação Bancária', icone: <PaidOutlinedIcon />, cor: 'financeiro', coluna: 1, linha: 4 },
  { rotulo: 'Conferência de Estoques', icone: <AssignmentOutlinedIcon />, cor: 'estoque', coluna: 1, linha: 5 },
  { rotulo: 'Painel de Estoques', icone: <AreaChartOutlinedIcon />, cor: 'painel', coluna: 2, linha: 1 },
  { rotulo: 'Relatório Despesas e Receitas', icone: <AssignmentOutlinedIcon />, cor: 'painel', coluna: 2, linha: 2, alto: true },
  { rotulo: 'DRE Financeiro', icone: <TrendingUpOutlinedIcon />, cor: 'painel', coluna: 2, linha: 4 },
  { rotulo: 'Manutenção de Produtos', icone: <WidgetsOutlinedIcon />, cor: 'cadastro', coluna: 2, linha: 5 },
  { rotulo: 'Expedições', icone: <Inventory2OutlinedIcon />, cor: 'comercial', coluna: 3, linha: 1 },
  { rotulo: 'Entrada de Fornecedor', icone: <DescriptionOutlinedIcon />, cor: 'comercial', coluna: 3, linha: 2 },
  { rotulo: 'Painel Financeiro', icone: <AreaChartOutlinedIcon />, cor: 'painel', coluna: 3, linha: 3, alto: true },
  { rotulo: 'Consulta de Pedidos', icone: <AssignmentOutlinedIcon />, cor: 'comercial', coluna: 4, linha: 1, alto: true },
  { rotulo: 'Consulta de Clientes e Fornecedores', icone: <PersonOutlineOutlinedIcon />, cor: 'cadastro', coluna: 4, linha: 3, alto: true },
  { rotulo: 'Painel de Pedidos', icone: <AssignmentOutlinedIcon />, cor: 'comercial', coluna: 5, linha: 1, alto: true },
  { rotulo: 'Relatório Financeiro', icone: <AssignmentOutlinedIcon />, cor: 'relatorio', coluna: 5, linha: 3, alto: true },
];

// Coluna da direita do Elevor.
const LATERAIS: Array<Pick<Bloco, 'rotulo' | 'icone' | 'cor'>> = [
  { rotulo: 'Calendário', icone: <CalendarMonthOutlinedIcon />, cor: 'financeiro' },
  { rotulo: 'Contatos', icone: <ContactsOutlinedIcon />, cor: 'comercial' },
  { rotulo: 'Mensagens', icone: <MailOutlineOutlinedIcon />, cor: 'mensagens' },
];

const LARGURA = 110;
const ALTURA = 92;
// No celular os blocos ficam em fila, duas colunas, todos do mesmo tamanho.
const gradeSx = { display: 'grid', gap: '4px', gridAutoRows: `${ALTURA}px`, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(5, ${LARGURA}px)` } };

function BotaoBloco({ rotulo, icone, cor, posicao, onClick }: Pick<Bloco, 'rotulo' | 'icone' | 'cor'> & { posicao?: object; onClick: () => void }) {
  return (
    <ButtonBase
      focusRipple
      aria-label={rotulo}
      onClick={onClick}
      sx={[
        {
          bgcolor: CORES[cor].fundo, color: CORES[cor].texto, borderRadius: '4px', flexDirection: 'column', gap: 1, p: 1,
          textAlign: 'center', fontSize: 14, fontWeight: 600, lineHeight: 1.25, '& svg': { fontSize: 32 },
          '&:hover': { filter: 'brightness(1.08)' },
        },
        posicao ?? {},
      ]}
    >
      {icone}
      <span>{rotulo}</span>
    </ButtonBase>
  );
}

export default function ErpInicioPage() {
  const [aviso, setAviso] = useState({ aberto: false, rotulo: '' });
  const abrir = (rotulo: string) => () => setAviso({ aberto: true, rotulo });

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 3 }}>
        <Corvo animacao="cabeca" pixel={3} />
        <Box>
          <Typography variant="h6" fontWeight={700}>Estamos trabalhando nisso</Typography>
          <Typography variant="body2" color="text.secondary">O ERP da Ledur está chegando ao painel, um módulo por vez.</Typography>
        </Box>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={{ xs: '4px', md: 2 }}>
        <Box sx={gradeSx}>
          {BLOCOS.map((b) => (
            <BotaoBloco
              key={b.rotulo}
              {...b}
              posicao={{ gridColumn: { sm: `${b.coluna}` }, gridRow: { sm: `${b.linha} / span ${b.alto ? 2 : 1}` } }}
              onClick={abrir(b.rotulo)}
            />
          ))}
        </Box>
        <Box sx={{ ...gradeSx, gridTemplateColumns: { ...gradeSx.gridTemplateColumns, md: `${LARGURA}px` }, alignContent: 'start' }}>
          {LATERAIS.map((b) => <BotaoBloco key={b.rotulo} {...b} onClick={abrir(b.rotulo)} />)}
        </Box>
      </Stack>

      <Dialog open={aviso.aberto} onClose={() => setAviso((a) => ({ ...a, aberto: false }))} maxWidth="xs" fullWidth>
        <DialogContent>
          <Stack spacing={2}>
            <Corvo animacao="cabeca" />
            <Typography variant="h6" fontWeight={700}>Estamos trabalhando nisso</Typography>
            <Typography variant="body1">{aviso.rotulo} ainda não chegou ao painel. Os módulos do ERP vão chegando um por vez.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setAviso((a) => ({ ...a, aberto: false }))}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
