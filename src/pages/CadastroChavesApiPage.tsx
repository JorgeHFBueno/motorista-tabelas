import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useAuth } from '../contexts/AuthContext';
import { useTituloPagina } from '../components/cabecalhoPagina';
import { listFuncionariosAtivos } from '../services/funcionarios-selecao.service';
import type { PessoaV2 } from '../utils/cadastrosV2';
import {
  CABECALHO_CHAVE_SISTEMA,
  criarChaveSistema,
  ENDERECO_SISTEMA_API,
  listarChavesSistema,
  PREFIXO_CHAVE_SISTEMA,
  revogarChaveSistema,
  type ChaveSistema,
} from '../services/chavesSistema';

// Chaves de API do sistema (Cadastros, só adm2), para robôs, planilhas e o Claude: cada chave vale por uma pessoa e abre o
// que as áreas da WEB dela abrem (hoje, a consulta do Cronograma de Obras, com a área Engenharia). Mesmo modelo da tela
// Chaves de API do Friday: a chave aparece uma vez, na criação; revogar corta o acesso na hora; nada é apagado.
const dataBr = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}` : '—');
const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.');
const abreCronograma = (p: PessoaV2) => p.perfis.adm2 === true || p.areas?.engenharia !== undefined;
const mono = { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 };

export default function CadastroChavesApiPage() {
  useTituloPagina('Chaves de API');
  const uidAtual = useAuth().currentUser?.uid ?? '';
  const [chaves, setChaves] = useState<ChaveSistema[] | null>(null);
  const [pessoas, setPessoas] = useState<PessoaV2[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [criada, setCriada] = useState<{ chave: string; pessoa: string } | null>(null);
  const [revogando, setRevogando] = useState<ChaveSistema | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try { setChaves(await listarChavesSistema()); setErro(null); } catch (e) { setErro(erroDe(e)); }
  }, []);
  useEffect(() => {
    void carregar();
    listFuncionariosAtivos().then(setPessoas).catch((e: unknown) => setErro(erroDe(e)));
  }, [carregar]);

  const nomes = useMemo(() => new Map(pessoas.map((p) => [p.uid, p.nome])), [pessoas]);
  const nome = (uid?: string) => (uid ? nomes.get(uid) ?? 'Pessoa inativa' : '—');

  const revogar = async () => {
    if (!revogando) return;
    setSalvando(true);
    try { await revogarChaveSistema(revogando.hash, uidAtual); setRevogando(null); await carregar(); } catch (e) { setErro(erroDe(e)); } finally { setSalvando(false); }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
              <Typography color="text.secondary" sx={{ maxWidth: '70ch' }}>
                Acesso do sistema para robôs, planilhas e o Claude. Cada chave vale por uma pessoa e abre só o que as áreas
                dela abrem na WEB. Hoje, a consulta do Cronograma de Obras, com a área Engenharia. As chaves do Friday ficam no Friday.
              </Typography>
              <Button variant="contained" onClick={() => setNova(true)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Nova chave</Button>
            </Stack>

            {erro && <Alert severity="error">{erro}</Alert>}
            {chaves && chaves.length === 0 && <Alert severity="info">Nenhuma chave criada.</Alert>}

            {chaves && chaves.length > 0 && (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Descrição</TableCell>
                      <TableCell>Pessoa</TableCell>
                      <TableCell>Chave</TableCell>
                      <TableCell>Criada</TableCell>
                      <TableCell>Criada por</TableCell>
                      <TableCell>Último uso</TableCell>
                      <TableCell>Situação</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {chaves.map((c) => (
                      <TableRow key={c.hash} sx={c.revogada_em ? { opacity: 0.55 } : undefined}>
                        <TableCell>{c.nome}</TableCell>
                        <TableCell>{nome(c.uid)}</TableCell>
                        <TableCell sx={{ ...mono, whiteSpace: 'nowrap' }}>{PREFIXO_CHAVE_SISTEMA}…{c.sufixo}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{dataBr(c.criado_em)}</TableCell>
                        <TableCell>{nome(c.criado_por)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{dataBr(c.ultimo_uso)}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {c.revogada_em
                            ? <span title={`por ${nome(c.revogada_por)}`}>Revogada em {dataBr(c.revogada_em)}</span>
                            : <Chip size="small" color="success" variant="outlined" label="Ativa" />}
                        </TableCell>
                        <TableCell align="right">
                          {!c.revogada_em && <Button size="small" color="error" onClick={() => setRevogando(c)}>Revogar</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        </Paper>

        <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
          <Stack spacing={1.5}>
            <Typography variant="h6" component="h2">Como usar</Typography>
            <Typography color="text.secondary">
              Mande a chave no cabeçalho <Box component="code" sx={mono}>{CABECALHO_CHAVE_SISTEMA}</Box>. Só consulta (GET):
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 3, color: 'text.secondary', display: 'grid', gap: 0.5 }}>
              <li><Box component="code" sx={mono}>{ENDERECO_SISTEMA_API}/eu</Box>: de quem é a chave e as áreas dessa pessoa.</li>
              <li>
                <Box component="code" sx={mono}>{ENDERECO_SISTEMA_API}/cronograma</Box>: alocações dos mestres, obras com os LOTEs e mestres do
                Cronograma de Obras (área Engenharia). Filtros opcionais: <Box component="code" sx={mono}>de</Box> e <Box component="code" sx={mono}>ate</Box> (datas),
                {' '}<Box component="code" sx={mono}>contrato</Box>, <Box component="code" sx={mono}>mestre</Box> e <Box component="code" sx={mono}>status</Box> (Status do LOTE, pode repetir).
              </li>
            </Box>
            <Typography color="text.secondary">No Claude Code, as mesmas consultas viram ferramentas (MCP):</Typography>
            <Box component="code" sx={{ ...mono, display: 'block', overflowX: 'auto', whiteSpace: 'nowrap', p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              claude mcp add --transport http sistema {ENDERECO_SISTEMA_API}/mcp --header "{CABECALHO_CHAVE_SISTEMA}: {PREFIXO_CHAVE_SISTEMA}…"
            </Box>
          </Stack>
        </Paper>
      </Stack>

      {nova && (
        <NovaChave
          pessoas={pessoas}
          criadoPor={uidAtual}
          onFechar={() => setNova(false)}
          onCriada={(chave, pessoa) => { setNova(false); setCriada({ chave, pessoa }); void carregar(); }}
        />
      )}

      <Dialog open={Boolean(criada)} fullWidth maxWidth="sm">
        <DialogTitle>Chave criada</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>Copie agora: <strong>ela não aparece de novo</strong>. Vale pelo acesso de {criada?.pessoa}, só para consulta.</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Box component="code" sx={{ ...mono, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{criada?.chave}</Box>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => { if (criada) void navigator.clipboard?.writeText(criada.chave).catch(() => undefined); }}>Copiar</Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Exemplo: <Box component="code" sx={{ ...mono, overflowWrap: 'anywhere' }}>curl -H "{CABECALHO_CHAVE_SISTEMA}: {criada?.chave}" "{ENDERECO_SISTEMA_API}/cronograma"</Box>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No Claude Code (MCP): <Box component="code" sx={{ ...mono, overflowWrap: 'anywhere' }}>claude mcp add --transport http sistema {ENDERECO_SISTEMA_API}/mcp --header "{CABECALHO_CHAVE_SISTEMA}: {criada?.chave}"</Box>
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setCriada(null)}>Já copiei</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(revogando)} onClose={salvando ? undefined : () => setRevogando(null)} fullWidth maxWidth="xs">
        <DialogTitle>Revogar a chave?</DialogTitle>
        <DialogContent>
          <Typography>
            A chave “{revogando?.nome}” ({PREFIXO_CHAVE_SISTEMA}…{revogando?.sufixo}) de {nome(revogando?.uid)} para de funcionar na hora.
            Para voltar a ter acesso, é preciso criar outra.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevogando(null)} disabled={salvando}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => void revogar()} disabled={salvando}>Revogar</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

function NovaChave({ pessoas, criadoPor, onFechar, onCriada }: {
  pessoas: PessoaV2[];
  criadoPor: string;
  onFechar: () => void;
  onCriada: (chave: string, pessoa: string) => void;
}) {
  const [uid, setUid] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pessoa = pessoas.find((p) => p.uid === uid);
  const criar = async () => {
    if (!pessoa || !descricao.trim()) return;
    setSalvando(true);
    try { onCriada(await criarChaveSistema(pessoa.uid, descricao, criadoPor), pessoa.nome); } catch (e) { setErro(erroDe(e)); setSalvando(false); }
  };
  return (
    <Dialog open onClose={salvando ? undefined : onFechar} fullWidth maxWidth="sm">
      <DialogTitle>Nova chave de API</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            id="chave-pessoa"
            select
            label="Pessoa"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            helperText={pessoa && !abreCronograma(pessoa)
              ? 'Sem a área Engenharia: a chave ainda não abre o cronograma.'
              : 'A chave abre o que as áreas da WEB dessa pessoa abrem.'}
          >
            {pessoas.map((p) => <MenuItem key={p.uid} value={p.uid}>{p.nome}{p.perfis.adm2 ? ' (adm2)' : ''}</MenuItem>)}
          </TextField>
          <TextField
            id="chave-descricao"
            label="Descrição (para quem é, onde roda)"
            placeholder="Ex.: Power BI do cronograma"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            inputProps={{ maxLength: 80 }}
          />
          <Typography variant="body2" color="text.secondary">Só consulta: nada é gravado por esta chave.</Typography>
          {erro && <Alert severity="error">{erro}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button variant="contained" onClick={() => void criar()} disabled={!pessoa || !descricao.trim() || salvando}>Criar chave</Button>
      </DialogActions>
    </Dialog>
  );
}
