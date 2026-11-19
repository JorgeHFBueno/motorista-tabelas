import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useAuth } from '../contexts/AuthContext';
import { useTituloPagina } from '../components/cabecalhoPagina';
import { listFuncionariosAtivos } from '../services/funcionarios-selecao.service';
import type { PessoaV2 } from '../utils/cadastrosV2';
import { AREAS } from '../services/areasWeb';
import { APIS, criarChave, listarChaves, revogarChave, type ApiDeArea, type ChaveApi } from '../services/chavesApi';

// APIs por área (Cadastros, só adm2), para robôs, planilhas e o Claude. Toda API é de uma área e tem a sua seção aqui;
// cada chave vale por uma pessoa dessa área e enxerga o que ela enxerga. A chave aparece uma vez, na criação; revogar
// corta o acesso na hora; nada é apagado. Contrato: The Manuscript, 02_APIS_FUNCTIONS/10_APIS_POR_AREA.md.
const dataBr = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}` : '—');
const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro inesperado.');
const mono = { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13 };
const Codigo = ({ children }: { children: ReactNode }) => <Box component="code" sx={{ ...mono, overflowWrap: 'anywhere' }}>{children}</Box>;
const daArea = (p: PessoaV2, api: ApiDeArea) => p.perfis.adm2 === true || p.areas?.[api.area] !== undefined;
const rotuloArea = (api: ApiDeArea) => AREAS.find((a) => a.chave === api.area)?.rotulo ?? api.area;
const comandoMcp = (api: ApiDeArea, chave: string) => `claude mcp add --transport http ${api.mcp} ${api.endereco}/mcp --header "${api.cabecalho}: ${chave}"`;

const DESCRICAO: Record<ApiDeArea['id'], string> = {
  friday: 'Quadros do Friday para robôs e assistentes. Cada chave vale por uma pessoa e vê só o que ela vê no Friday '
    + '(quadros abertos e os restritos em que ela está). A chave é só de consulta ou também de escrita.',
  cronoobra: 'Consulta do Cronograma de Obras (/engenharia/cronograma), área Engenharia: qual mestre está em qual LOTE, de '
    + 'quando a quando, com os dias NT. Só consulta.',
};

const EXEMPLO: Record<ApiDeArea['id'], string> = { friday: '/buscar?q=coqueiros', cronoobra: '/cronograma' };

function ComoUsar({ api }: { api: ApiDeArea }) {
  const e = api.endereco;
  if (api.id === 'cronoobra') {
    return (
      <Stack spacing={1}>
        <Typography color="text.secondary">Mande a chave no cabeçalho <Codigo>{api.cabecalho}</Codigo>. Só consulta (GET):</Typography>
        <Box component="ul" sx={{ m: 0, pl: 3, color: 'text.secondary', display: 'grid', gap: 0.5 }}>
          <li><Codigo>{e}/eu</Codigo>: de quem é a chave.</li>
          <li>
            <Codigo>{e}/cronograma</Codigo>: alocações dos mestres, obras com os LOTEs e mestres. Filtros opcionais: <Codigo>de</Codigo> e <Codigo>ate</Codigo> (datas),
            {' '}<Codigo>contrato</Codigo>, <Codigo>mestre</Codigo> e <Codigo>status</Codigo> (Status do LOTE, pode repetir).
          </li>
        </Box>
        <Typography color="text.secondary">No Claude Code, as mesmas consultas viram ferramentas (MCP): <Codigo>{comandoMcp(api, `${api.prefixo}…`)}</Codigo></Typography>
      </Stack>
    );
  }
  return (
    <Stack spacing={1}>
      <Typography color="text.secondary">Mande a chave no cabeçalho <Codigo>{api.cabecalho}</Codigo>. Consulta (GET), qualquer chave:</Typography>
      <Box component="ul" sx={{ m: 0, pl: 3, color: 'text.secondary', display: 'grid', gap: 0.5 }}>
        <li><Codigo>{e}/eu</Codigo>: de quem é a chave e se ela grava.</li>
        <li><Codigo>{e}/quadros</Codigo>: áreas, pastas e quadros que a pessoa vê.</li>
        <li><Codigo>{e}/quadros/&lt;id&gt;</Codigo>: colunas, grupos, itens e subitens, com os valores em texto.</li>
        <li><Codigo>{e}/buscar?q=coqueiros</Codigo>: itens pelo nome, em todos os quadros; com <Codigo>&amp;quadro=&lt;id&gt;</Codigo>, procura também nos valores daquele quadro (ex.: o subcentro).</li>
        <li><Codigo>{e}/itens/&lt;id&gt;/arquivos</Codigo>: arquivos do item (colunas, atualizações e aba Arquivos), com o link de download.</li>
        <li><Codigo>{e}/arquivos/&lt;id&gt;</Codigo>: baixa o arquivo (o próprio PDF, não JSON).</li>
      </Box>
      <Typography color="text.secondary">Escrita (POST, corpo JSON), só chave de escrita; <Codigo>"simular": true</Codigo> confere sem gravar:</Typography>
      <Box component="ul" sx={{ m: 0, pl: 3, color: 'text.secondary', display: 'grid', gap: 0.5 }}>
        <li><Codigo>{e}/itens/&lt;id&gt;/valor</Codigo> <Codigo>{'{ "coluna": "Situação", "valor": "Parado" }'}</Codigo>: muda uma célula (coluna pelo título ou id; status e lista pelo texto, pessoa pelo nome, data DD/MM/AAAA).</li>
        <li><Codigo>{e}/quadros/&lt;id&gt;/itens</Codigo> <Codigo>{'{ "nome": "…", "grupo": "…", "valores": { … } }'}</Codigo>: cria um item.</li>
        <li><Codigo>{e}/itens/&lt;id&gt;/subitens</Codigo> <Codigo>{'{ "nome": "…", "valores": { … } }'}</Codigo>: cria um subitem no item.</li>
        <li><Codigo>{e}/itens/&lt;id&gt;/atualizacoes</Codigo> <Codigo>{'{ "texto": "…" }'}</Codigo>: publica uma atualização.</li>
        <li><Codigo>{e}/itens/&lt;id&gt;/arquivos?nome=Edital.pdf&amp;coluna=Doc.%20Edital</Codigo>, com o arquivo no corpo (não JSON; até 25 MB): anexa o arquivo; sem <Codigo>coluna</Codigo>, vai para a aba Arquivos do item. Ex.: <Codigo>curl --data-binary @Edital.pdf -H "Content-Type: application/pdf" …</Codigo>.</li>
      </Box>
      <Typography color="text.secondary">A escrita segue as regras da tela (campos oficiais validados, só leitura recusado, automações disparadas) e fica na atividade em nome da pessoa, com a marca “API”.</Typography>
      <Typography color="text.secondary">
        No Claude Code (MCP), as mesmas rotas viram ferramentas. Qualquer chave consulta (<Codigo>buscar_itens</Codigo>, <Codigo>ler_quadro</Codigo>, <Codigo>baixar_arquivo</Codigo>…); a chave
        de <strong>consulta e escrita</strong> também grava (<Codigo>gravar_valor</Codigo>, <Codigo>criar_item</Codigo>, <Codigo>criar_subitem</Codigo>, <Codigo>publicar_atualizacao</Codigo>), e o
        Claude Code pede aprovação antes de cada gravação. Para passar a gravar, crie uma chave de escrita (o tipo não muda depois) e troque a chave no Claude Code
        (<Codigo>claude mcp remove {api.mcp}</Codigo> e adicione de novo): <Codigo>{comandoMcp(api, `${api.prefixo}…`)}</Codigo>
      </Typography>
    </Stack>
  );
}

export default function CadastroApisPage() {
  useTituloPagina('APIs');
  const uidAtual = useAuth().currentUser?.uid ?? '';
  const [pessoas, setPessoas] = useState<PessoaV2[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { listFuncionariosAtivos().then(setPessoas).catch((e: unknown) => setErro(erroDe(e))); }, []);

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Typography color="text.secondary" sx={{ maxWidth: '80ch' }}>
          Cada API é de uma área e só consulta (ou publica) nessa área. Cada chave vale por uma pessoa da área e enxerga o que ela enxerga.
          A chave aparece uma vez, na criação; revogar corta o acesso na hora.
        </Typography>
        {erro && <Alert severity="error">{erro}</Alert>}
        {APIS.map((api) => <SecaoApi key={api.id} api={api} pessoas={pessoas} uidAtual={uidAtual} />)}
      </Stack>
    </Container>
  );
}

function SecaoApi({ api, pessoas, uidAtual }: { api: ApiDeArea; pessoas: PessoaV2[]; uidAtual: string }) {
  const [chaves, setChaves] = useState<ChaveApi[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [criada, setCriada] = useState<{ chave: string; pessoa: string; escrita: boolean } | null>(null);
  const [revogando, setRevogando] = useState<ChaveApi | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try { setChaves(await listarChaves(api)); setErro(null); } catch (e) { setErro(erroDe(e)); }
  }, [api]);
  useEffect(() => { void carregar(); }, [carregar]);

  const nomes = useMemo(() => new Map(pessoas.map((p) => [p.uid, p.nome])), [pessoas]);
  const nome = (uid?: string) => (uid ? nomes.get(uid) ?? 'Pessoa inativa' : '—');
  const comEscrita = (chaves ?? []).filter((c) => c.escrita && !c.revogada_em);

  const revogar = async () => {
    if (!revogando) return;
    setSalvando(true);
    try { await revogarChave(api, revogando.hash, uidAtual); setRevogando(null); await carregar(); } catch (e) { setErro(erroDe(e)); } finally { setSalvando(false); }
  };

  return (
    <Paper elevation={1} sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }} justifyContent="space-between">
          <Box>
            <Typography variant="h6" component="h2">{api.titulo}</Typography>
            <Typography color="text.secondary" sx={{ maxWidth: '75ch' }}>{DESCRICAO[api.id]}</Typography>
          </Box>
          <Button variant="contained" onClick={() => setNova(true)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Nova chave</Button>
        </Stack>

        {erro && <Alert severity="error">{erro}</Alert>}
        {comEscrita.length > 0 && (
          <Alert severity="warning">
            {comEscrita.length} {comEscrita.length === 1 ? 'chave ativa grava' : 'chaves ativas gravam'} no {api.titulo}:{' '}
            {comEscrita.map((c) => `${c.nome} (de ${nome(c.uid)}, criada por ${nome(c.criado_por)})`).join('; ')}. O que elas gravam aparece na atividade com a marca “API”.
          </Alert>
        )}
        {chaves && chaves.length === 0 && <Alert severity="info">Nenhuma chave criada.</Alert>}

        {chaves && chaves.length > 0 && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Descrição</TableCell>
                  <TableCell>Pessoa</TableCell>
                  {api.escrita && <TableCell>Tipo</TableCell>}
                  <TableCell>Chave</TableCell>
                  <TableCell>Criada</TableCell>
                  <TableCell>Criada por</TableCell>
                  <TableCell>Último uso</TableCell>
                  {api.escrita && <TableCell>Última escrita</TableCell>}
                  <TableCell>Situação</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {chaves.map((c) => (
                  <TableRow key={c.hash} sx={c.revogada_em ? { opacity: 0.55 } : undefined}>
                    <TableCell>{c.nome}</TableCell>
                    <TableCell>{nome(c.uid)}</TableCell>
                    {api.escrita && (
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {c.escrita ? <Chip size="small" color="warning" variant="outlined" label="Consulta e escrita" /> : 'Só consulta'}
                      </TableCell>
                    )}
                    <TableCell sx={{ ...mono, whiteSpace: 'nowrap' }}>{api.prefixo}…{c.sufixo}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dataBr(c.criado_em)}</TableCell>
                    <TableCell>{nome(c.criado_por)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{dataBr(c.ultimo_uso)}</TableCell>
                    {api.escrita && <TableCell sx={{ whiteSpace: 'nowrap' }}>{c.escrita ? dataBr(c.ultima_escrita) : ''}</TableCell>}
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

        <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography>Como usar</Typography></AccordionSummary>
          <AccordionDetails><ComoUsar api={api} /></AccordionDetails>
        </Accordion>
      </Stack>

      {nova && (
        <NovaChave
          api={api}
          pessoas={pessoas.filter((p) => daArea(p, api))}
          criadoPor={uidAtual}
          onFechar={() => setNova(false)}
          onCriada={(chave, pessoa, escrita) => { setNova(false); setCriada({ chave, pessoa, escrita }); void carregar(); }}
        />
      )}

      <Dialog open={Boolean(criada)} fullWidth maxWidth="sm">
        <DialogTitle>Chave criada</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography>
              Copie agora: <strong>ela não aparece de novo</strong>. Vale pelo acesso de {criada?.pessoa} no {api.titulo},{' '}
              {criada?.escrita ? <strong>com escrita</strong> : 'só para consulta'}.
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Box component="code" sx={{ ...mono, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{criada?.chave}</Box>
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => { if (criada) void navigator.clipboard?.writeText(criada.chave).catch(() => undefined); }}>Copiar</Button>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Exemplo: <Codigo>curl -H "{api.cabecalho}: {criada?.chave}" "{api.endereco}{EXEMPLO[api.id]}"</Codigo>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No Claude Code (MCP): <Codigo>{criada ? comandoMcp(api, criada.chave) : ''}</Codigo>
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
            A chave “{revogando?.nome}” ({api.prefixo}…{revogando?.sufixo}) de {nome(revogando?.uid)} para de funcionar na hora.
            Para voltar a ter acesso, é preciso criar outra.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevogando(null)} disabled={salvando}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={() => void revogar()} disabled={salvando}>Revogar</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

function NovaChave({ api, pessoas, criadoPor, onFechar, onCriada }: {
  api: ApiDeArea;
  pessoas: PessoaV2[];
  criadoPor: string;
  onFechar: () => void;
  onCriada: (chave: string, pessoa: string, escrita: boolean) => void;
}) {
  const [uid, setUid] = useState('');
  const [descricao, setDescricao] = useState('');
  const [escrita, setEscrita] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pessoa = pessoas.find((p) => p.uid === uid);
  const criar = async () => {
    if (!pessoa || !descricao.trim()) return;
    setSalvando(true);
    try { onCriada(await criarChave(api, pessoa.uid, descricao, criadoPor, escrita), pessoa.nome, escrita); } catch (e) { setErro(erroDe(e)); setSalvando(false); }
  };
  return (
    <Dialog open onClose={salvando ? undefined : onFechar} fullWidth maxWidth="sm">
      <DialogTitle>Nova chave · {api.titulo}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            id={`chave-${api.id}-pessoa`}
            select
            label="Pessoa"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            helperText={`Só quem vê a área ${rotuloArea(api)} (ou é adm2). A chave vê o que essa pessoa vê.`}
          >
            {pessoas.map((p) => <MenuItem key={p.uid} value={p.uid}>{p.nome}{p.perfis.adm2 ? ' (adm2)' : ''}</MenuItem>)}
          </TextField>
          <TextField
            id={`chave-${api.id}-descricao`}
            label="Descrição (para quem é, onde roda)"
            placeholder={api.id === 'friday' ? 'Ex.: Robô de obras do Samuel' : 'Ex.: Power BI do cronograma'}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            inputProps={{ maxLength: 80 }}
          />
          {api.escrita ? (
            <Box>
              <Typography variant="body2" color="text.secondary">Tipo (não muda depois: para trocar, revogue e crie outra)</Typography>
              <RadioGroup value={escrita ? 'escrita' : 'consulta'} onChange={(e) => setEscrita(e.target.value === 'escrita')}>
                <FormControlLabel value="consulta" control={<Radio size="small" />} label="Só consulta (GET)" />
                <FormControlLabel value="escrita" control={<Radio size="small" />} label="Consulta e escrita (GET e POST), em nome da pessoa" />
              </RadioGroup>
              {escrita && (
                <Alert severity="warning">
                  Esta chave GRAVA no {api.titulo} em nome de {pessoa?.nome ?? 'pessoa escolhida'}. Fica registrado que você a criou, e tudo o
                  que ela gravar aparece na atividade com a marca “API”.
                </Alert>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">Só consulta: nada é gravado por esta chave.</Typography>
          )}
          {erro && <Alert severity="error">{erro}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button variant="contained" color={escrita ? 'warning' : 'primary'} onClick={() => void criar()} disabled={!pessoa || !descricao.trim() || salvando}>
          {escrita ? 'Criar com escrita' : 'Criar chave'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
