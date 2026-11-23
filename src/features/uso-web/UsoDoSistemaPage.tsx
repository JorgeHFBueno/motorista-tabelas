import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Container,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useTituloPagina } from '../../components/cabecalhoPagina';
import { listFuncionariosAtivos } from '../../services/funcionarios-selecao.service';
import { listarUso } from './usoWeb';
import { diasDoPeriodo, GRUPOS, resumirUso, type PessoaDoUso, type RegistroDeUso } from './usoWebCore';

// Uso do sistema (Cadastros, só adm2): quantas vezes cada tela da WEB foi aberta, por quem e quando. O app Flutter não
// entra. Contrato: The Manuscript, 03_APLICACAO_WEB/05_CADASTROS.md (Uso do sistema) e 01_FIRESTORE/COLECOES/uso-web.md.
// Dia em que a contagem foi publicada (dias antes dele aparecem zerados).
const INICIO_DA_CONTAGEM = '2026-11-23';
const PERIODOS = [7, 30, 90] as const;
const ABAS = ['Telas', 'Áreas', 'Pessoas', 'Por dia'] as const;
const dataBr = (dia: string | null) => (dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : '—');
const numero = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const rotuloGrupo = (chave: string) => GRUPOS.find((g) => g.chave === chave)?.rotulo ?? chave;
const semUso = <Chip size="small" label="sem uso" color="warning" variant="outlined" />;

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 160 }}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>{valor}</Typography>
    </Paper>
  );
}

function Tabela({ colunas, children }: { colunas: string[]; children: React.ReactNode }) {
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>{colunas.map((c, i) => <TableCell key={c} align={i === 0 ? 'left' : 'right'}>{c}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>{children}</TableBody>
      </Table>
    </TableContainer>
  );
}

export default function UsoDoSistemaPage() {
  useTituloPagina('Uso do sistema');
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>(30);
  const [contarAdm2, setContarAdm2] = useState(false);
  const [aba, setAba] = useState(0);
  const [registros, setRegistros] = useState<RegistroDeUso[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaDoUso[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const dias = useMemo(() => diasDoPeriodo(new Date(), periodo), [periodo]);

  useEffect(() => {
    listFuncionariosAtivos()
      .then((lista) => setPessoas(lista.map((p) => ({
        uid: p.uid, nome: p.nome, adm2: p.perfis.adm2 === true, temAreaWeb: Object.keys(p.areas ?? {}).length > 0,
      }))))
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Erro ao ler as pessoas.'));
  }, []);

  useEffect(() => {
    let cancelado = false;
    setRegistros(null);
    listarUso(dias[0])
      .then((lista) => { if (!cancelado) setRegistros(lista); })
      .catch((e: unknown) => { if (!cancelado) setErro(e instanceof Error ? e.message : 'Erro ao ler o uso.'); });
    return () => { cancelado = true; };
  }, [dias]);

  const resumo = useMemo(() => (registros ? resumirUso(registros, pessoas, dias, contarAdm2) : null), [registros, pessoas, dias, contarAdm2]);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2.5}>
        <Typography color="text.secondary" sx={{ maxWidth: '80ch' }}>
          Quantas vezes cada tela da WEB foi aberta, por quem e quando. Cada abertura de tela conta uma vez; o que a pessoa
          faz dentro dela não é gravado. Só a WEB: o uso do app não entra.
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
          <ToggleButtonGroup size="small" exclusive value={periodo} onChange={(_, v) => v && setPeriodo(v)}>
            {PERIODOS.map((p) => <ToggleButton key={p} value={p}>{p} dias</ToggleButton>)}
          </ToggleButtonGroup>
          <FormControlLabel control={<Switch checked={contarAdm2} onChange={(e) => setContarAdm2(e.target.checked)} />} label="Contar quem tem adm2" />
        </Stack>
        {erro && <Alert severity="error">{erro}</Alert>}
        {!resumo && !erro && <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>}
        {resumo && (
          <>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <Numero rotulo="Pessoas que usaram" valor={numero(resumo.pessoas)} />
              <Numero rotulo="Aberturas de tela" valor={numero(resumo.aberturas)} />
              <Numero rotulo="Média de pessoas por dia" valor={numero(resumo.mediaPessoasPorDia)} />
            </Stack>
            <Tabs value={aba} onChange={(_, v: number) => setAba(v)} variant="scrollable" allowScrollButtonsMobile>
              {ABAS.map((a) => <Tab key={a} label={a} />)}
            </Tabs>
            {aba === 0 && (
              <Tabela colunas={['Tela', 'Área', 'Aberturas', 'Pessoas', 'Último uso']}>
                {resumo.porTela.map((t) => (
                  <TableRow key={t.rota} hover>
                    <TableCell>
                      <Typography variant="body2">{t.rotulo}</Typography>
                      <Typography variant="caption" color="text.secondary">/{t.rota === 'inicio' ? '' : t.rota}</Typography>
                    </TableCell>
                    <TableCell align="right">{rotuloGrupo(t.grupo)}</TableCell>
                    <TableCell align="right">{t.aberturas ? numero(t.aberturas) : semUso}</TableCell>
                    <TableCell align="right">{numero(t.pessoas)}</TableCell>
                    <TableCell align="right">{dataBr(t.ultimoDia)}</TableCell>
                  </TableRow>
                ))}
              </Tabela>
            )}
            {aba === 1 && (
              <Tabela colunas={['Área', 'Aberturas', 'Pessoas', 'Telas sem uso']}>
                {resumo.porGrupo.map((g) => (
                  <TableRow key={g.chave} hover>
                    <TableCell>{g.rotulo}</TableCell>
                    <TableCell align="right">{numero(g.aberturas)}</TableCell>
                    <TableCell align="right">{numero(g.pessoas)}</TableCell>
                    <TableCell align="right">{g.telasSemUso} de {g.telas}</TableCell>
                  </TableRow>
                ))}
              </Tabela>
            )}
            {aba === 2 && (
              <Tabela colunas={['Pessoa', 'Dias com uso', 'Aberturas', 'Telas mais abertas', 'Último uso']}>
                {resumo.porPessoa.map((p) => (
                  <TableRow key={p.uid} hover>
                    <TableCell>{p.nome}</TableCell>
                    <TableCell align="right">{p.dias ? `${p.dias} de ${dias.length}` : <Chip size="small" label="não usou" color="warning" variant="outlined" />}</TableCell>
                    <TableCell align="right">{numero(p.aberturas)}</TableCell>
                    <TableCell align="right">{p.principais.join(', ') || '—'}</TableCell>
                    <TableCell align="right">{dataBr(p.ultimoDia)}</TableCell>
                  </TableRow>
                ))}
              </Tabela>
            )}
            {aba === 3 && (
              <Tabela colunas={['Dia', 'Pessoas', 'Aberturas']}>
                {resumo.porDia.map((d) => (
                  <TableRow key={d.dia} hover>
                    <TableCell>{dataBr(d.dia)}</TableCell>
                    <TableCell align="right">{numero(d.pessoas)}</TableCell>
                    <TableCell align="right">{numero(d.aberturas)}</TableCell>
                  </TableRow>
                ))}
              </Tabela>
            )}
            <Typography variant="caption" color="text.secondary">
              Pessoas: quem abriu a WEB no período e quem tem área da WEB e não abriu. Quem só usa o app não aparece.
              A contagem começou em {dataBr(INICIO_DA_CONTAGEM)}; antes disso não há dados.
            </Typography>
          </>
        )}
      </Stack>
    </Container>
  );
}
