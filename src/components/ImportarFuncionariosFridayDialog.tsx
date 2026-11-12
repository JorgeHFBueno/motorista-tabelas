import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { formatarCelular } from '../services/loginIdentifier';
import {
  criarDoQuadro, ligarItemAoFuncionario, listarQuadroFuncionarios, mensagemDaFunction,
  type FuncionarioLivre, type PessoaQuadro, type ResultadoImportar, type SituacaoImportar,
} from '../services/funcionariosImportarFriday';

// Importar do quadro FUNCIONARIOS do Friday (Cadastros → Usuários): sugere contas novas a partir dos itens do quadro.
// Quem é novo ganha login pelo celular, senha = 6 primeiros dígitos do CPF e só a credencial Motorista; quem já é
// funcionário (mesmo celular) só é ligado ao item. Quem já está aqui com outro login é ligado à mão, para não duplicar.

const ROTULO: Record<SituacaoImportar, string> = { novo: 'Novo', funcionario: 'Já é funcionário', vinculado: 'Ligado', incompleto: 'Incompleto', fora: 'Fora' };
const COR: Record<SituacaoImportar, 'success' | 'info' | 'default' | 'warning' | 'error'> = { novo: 'success', funcionario: 'info', vinculado: 'default', incompleto: 'warning', fora: 'error' };
const ORDEM: Record<SituacaoImportar, number> = { novo: 0, funcionario: 1, incompleto: 2, fora: 3, vinculado: 4 };

type Props = { open: boolean; onClose: () => void; onImportou: () => void };

export default function ImportarFuncionariosFridayDialog({ open, onClose, onImportou }: Props) {
  const [pessoas, setPessoas] = useState<PessoaQuadro[] | null>(null);
  const [livres, setLivres] = useState<FuncionarioLivre[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [ligando, setLigando] = useState<{ id: string; uid: string } | null>(null);
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoImportar[] | null>(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const data = await listarQuadroFuncionarios();
      setPessoas(data.pessoas); setLivres(data.livres);
    } catch (e) { setErro(mensagemDaFunction(e)); }
  }, []);
  useEffect(() => {
    if (!open) return;
    setPessoas(null); setMarcados(new Set()); setResultados(null); setLigando(null); setBusca('');
    void carregar();
  }, [open, carregar]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (pessoas ?? []).filter((p) => !t || `${p.nome} ${p.celular ?? ''} ${p.funcionario ?? ''}`.toLowerCase().includes(t))
      .sort((a, b) => ORDEM[a.situacao] - ORDEM[b.situacao]);
  }, [pessoas, busca]);
  const conta = (s: SituacaoImportar) => (pessoas ?? []).filter((p) => p.situacao === s).length;
  const marcaveis = (pessoas ?? []).filter((p) => p.situacao === 'novo' || p.situacao === 'funcionario');
  // "Marcar todas" deixa de fora quem parece já ser funcionário com outro login: criar duplicaria a pessoa.
  const marcaveisEmLote = marcaveis.filter((p) => !p.sugestao);
  const marcar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const executar = async () => {
    if (!marcados.size || rodando) return;
    setRodando(true); setResultados(null); setErro(null);
    try {
      setResultados(await criarDoQuadro([...marcados]));
      setMarcados(new Set());
      onImportou();
      await carregar();
    } catch (e) { setErro(mensagemDaFunction(e)); }
    setRodando(false);
  };

  const confirmarLigacao = async (p: PessoaQuadro) => {
    if (!ligando?.uid || rodando) return;
    setRodando(true); setResultados(null);
    try {
      setResultados([await ligarItemAoFuncionario(p.id, ligando.uid)]);
      setLigando(null);
      setMarcados((m) => { const n = new Set(m); n.delete(p.id); return n; });
      onImportou();
      await carregar();
    } catch (e) { setResultados([{ id: p.id, nome: p.nome, resultado: 'erro', mensagem: mensagemDaFunction(e) }]); }
    setRodando(false);
  };

  const criados = resultados?.filter((r) => r.resultado === 'criado').length ?? 0;
  return (
    <Dialog open={open} onClose={rodando ? undefined : onClose} fullWidth maxWidth="md" scroll="paper">
      <DialogTitle>Importar do quadro Funcionários</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Sugere contas a partir dos itens do quadro FUNCIONARIOS do Friday, que continua livre. Quem é <b>novo</b> ganha login pelo
            <b> telefone</b>, senha com os <b>6 primeiros dígitos do CPF</b> e só a credencial <b>Motorista</b>. Quem <b>já é funcionário</b>{' '}
            (mesmo telefone) só é ligado ao item. Quem já está no sistema com <b>outro login</b> aparece como novo: use <b>Ligar</b> para não duplicar.
          </Typography>

          {resultados && (
            <Alert severity={resultados.some((r) => r.resultado === 'erro') ? 'warning' : 'success'}>
              {criados} conta(s) criada(s) · {resultados.filter((r) => r.resultado === 'vinculado').length} ligada(s) · {resultados.filter((r) => r.resultado === 'erro').length} com erro
              {resultados.filter((r) => r.resultado === 'erro').map((r) => <Box key={r.id} component="div">{r.nome}: {r.mensagem}</Box>)}
              {criados > 0 && <Box component="div" sx={{ mt: 0.5 }}>Avise as pessoas: o login é o telefone e a senha, os 6 primeiros dígitos do CPF.</Box>}
            </Alert>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField size="small" label="Buscar nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} fullWidth />
            <Button sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} disabled={rodando || !marcaveisEmLote.length}
              title={marcaveisEmLote.length < marcaveis.length ? 'Não marca quem parece já ser funcionário' : undefined}
              onClick={() => setMarcados(new Set(marcaveisEmLote.map((p) => p.id)))}>Marcar todas ({marcaveisEmLote.length})</Button>
            <Button sx={{ whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => void carregar()} disabled={rodando}>Atualizar</Button>
          </Stack>
          {pessoas && (
            <Typography variant="caption" color="text.secondary">
              {conta('novo')} novas · {conta('funcionario')} já funcionários · {conta('incompleto')} incompletas · {conta('fora')} fora · {conta('vinculado')} ligadas
            </Typography>
          )}

          {erro ? <Alert severity="error">Não foi possível ler o quadro: {erro}</Alert>
            : !pessoas ? <Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={18} /><Typography variant="body2">Lendo o quadro…</Typography></Stack>
            : !filtradas.length ? <Alert severity="info">Ninguém encontrado.</Alert>
            : (
              <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
                {filtradas.map((p) => {
                  const pode = p.situacao === 'novo' || p.situacao === 'funcionario';
                  const podeLigar = (p.situacao === 'novo' || p.situacao === 'incompleto') && livres.length > 0;
                  return (
                    <Stack key={p.id} direction="row" spacing={1} alignItems="flex-start" sx={{ py: 1 }}>
                      <Checkbox size="small" checked={marcados.has(p.id)} disabled={rodando || !pode} onChange={() => marcar(p.id)} sx={{ mt: -0.5 }}
                        inputProps={{ 'aria-label': `Marcar ${p.nome}` }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600}>{p.nome}</Typography>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {[
                            p.celular && formatarCelular(p.celular),
                            p.funcionario && p.funcionario !== p.nome && `funcionário: ${p.funcionario}`,
                            p.situacao === 'novo' && p.uid && 'já há uma conta com este telefone, sem funcionário: ela é reaproveitada e a senha antiga deixa de valer',
                            p.motivo,
                          ].filter(Boolean).join(' · ')}
                        </Typography>
                        {p.sugestao && ligando?.id !== p.id && (
                          <Typography variant="caption" color="warning.main" component="div">Parece ser o funcionário {p.sugestao.nome}: ligue em vez de criar, para não duplicar.</Typography>
                        )}
                        {ligando?.id === p.id && (
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                            <TextField select size="small" label="Funcionário" value={ligando.uid} disabled={rodando} sx={{ minWidth: 240 }}
                              onChange={(e) => setLigando({ id: p.id, uid: e.target.value })}>
                              {livres.map((f) => <MenuItem key={f.uid} value={f.uid}>{f.nome}{f.ativo ? '' : ' (inativo)'}</MenuItem>)}
                            </TextField>
                            <Button variant="contained" size="small" disabled={rodando || !ligando.uid} onClick={() => void confirmarLigacao(p)}>{rodando ? 'Ligando…' : 'Ligar'}</Button>
                            <Button size="small" disabled={rodando} onClick={() => setLigando(null)}>Cancelar</Button>
                          </Stack>
                        )}
                      </Box>
                      <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
                        <Chip size="small" label={ROTULO[p.situacao]} color={COR[p.situacao]} variant={p.situacao === 'vinculado' ? 'outlined' : 'filled'} />
                        {podeLigar && ligando?.id !== p.id && (
                          <Button size="small" disabled={rodando} title="Já está no sistema com outro login: só liga ao item, sem criar conta"
                            onClick={() => setLigando({ id: p.id, uid: p.sugestao?.uid ?? '' })}>Ligar</Button>
                        )}
                      </Stack>
                    </Stack>
                  );
                })}
              </Stack>
            )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={rodando}>Fechar</Button>
        <Button variant="contained" onClick={() => void executar()} disabled={rodando || !marcados.size}>
          {rodando ? 'Gravando…' : `Criar e ligar (${marcados.size})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
