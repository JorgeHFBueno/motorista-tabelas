import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    Paper,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { aplicarCorrecoesKm, carregarLeiturasKm } from '../services/normalizacao-km.service';
import type { ItemFrotaV2 } from '../utils/cadastrosV2';
import {
    analisarLeituras,
    chaveKm,
    lerNovoKm,
    montarLinhaDoTempo,
    referenciaPadrao,
    sugestaoKmUltimo,
    sugestaoPorDigitos,
    ultimaLeitura,
    type AlteracaoKm,
    type LeituraAnalisada,
    type LeituraKm,
} from '../utils/normalizacaoKm';

// Normalização de KM/horímetro (ferramenta normalizacao-km-v2): linha do tempo das leituras do veículo, alertas locais
// e correção manual. Nada é gravado até "Aplicar"; alertas e sugestões nunca entram sozinhos nas alterações.

type Preparada = AlteracaoKm & { rotulo: string; data: Date | null };
type Alvo = Pick<AlteracaoKm, 'collection' | 'documentId' | 'field' | 'valorOriginal'> & { rotulo: string; data: Date | null };

const numero = new Intl.NumberFormat('pt-BR');
const dataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const formatar = (v: unknown) => (typeof v === 'number' ? numero.format(v) : String(v ?? '—'));
// Só leituras com valor numérico são editáveis (o campo fica desabilitado nas outras).
const alvoDaLeitura = (l: LeituraAnalisada): Alvo => ({ collection: l.collection, documentId: l.documentId, field: l.field, valorOriginal: l.valor as number, rotulo: l.rotulo, data: l.data });

function prioridade(l: LeituraAnalisada): string | null {
    const multiplicar = l.alertas.find((a) => a.codigo === 'SUGESTAO_MULTIPLICAR');
    if (multiplicar?.codigo === 'SUGESTAO_MULTIPLICAR') return `Retrocesso · ×${multiplicar.multiplicador}?`;
    const digitos = l.alertas.find((a) => a.codigo === 'MAIS_DIGITOS_QUE_REFERENCIA');
    if (digitos?.codigo === 'MAIS_DIGITOS_QUE_REFERENCIA') return `${digitos.digitosValor} dígitos · ref. ${digitos.digitosReferencia}`;
    return l.alertas.some((a) => a.codigo === 'RETROCESSO_LOCAL') ? 'Retrocesso' : null;
}

function detalhes(l: LeituraAnalisada): string {
    const sugestoes = l.alertas.flatMap((a) => (a.codigo === 'SUGESTAO_MULTIPLICAR' ? [`×${a.multiplicador} = ${numero.format(a.valor)}`] : []));
    return `Anterior: ${formatar(l.anterior)} · Próximo: ${formatar(l.posterior)}${sugestoes.length ? ` · Sugestões: ${sugestoes.join(', ')}` : ''}`;
}

const LinhaLeitura = memo(function LinhaLeitura({ leitura, valor, sugerido, preparado, erro, podeEditar, onChange, onSalvar }: {
    leitura: LeituraAnalisada;
    valor: string;
    sugerido: boolean;
    preparado: boolean;
    erro: string | undefined;
    podeEditar: boolean;
    onChange: (key: string, valor: string) => void;
    onSalvar: (leitura: LeituraAnalisada, valor: string) => void;
}) {
    const rotuloAlerta = prioridade(leitura);
    return (
        <TableRow sx={leitura.suspeito ? { bgcolor: (t) => alpha(t.palette.warning.main, 0.12) } : undefined}>
            <TableCell sx={{ whiteSpace: 'nowrap' }}>{leitura.data ? dataHora.format(leitura.data) : '—'}</TableCell>
            <TableCell>
                <Tooltip title={`${leitura.collection}/${leitura.documentId}`}>
                    <span>{leitura.rotulo}</span>
                </Tooltip>
            </TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatar(leitura.valorBruto)}</TableCell>
            <TableCell>
                {rotuloAlerta ? (
                    <Tooltip title={detalhes(leitura)}>
                        <Chip size="small" color="warning" label={rotuloAlerta} />
                    </Tooltip>
                ) : '—'}
            </TableCell>
            <TableCell sx={{ minWidth: 150 }}>
                <TextField
                    size="small"
                    value={valor}
                    placeholder="Novo valor"
                    onChange={(event) => onChange(leitura.key, event.target.value)}
                    error={Boolean(erro)}
                    helperText={erro ?? (preparado ? 'Preparado' : sugerido ? 'Sugestão' : undefined)}
                    disabled={!podeEditar || leitura.valor === null}
                    slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Novo valor de ${leitura.key}` } }}
                />
            </TableCell>
            <TableCell>
                <Button size="small" onClick={() => onSalvar(leitura, valor)} disabled={!podeEditar || leitura.valor === null}>Salvar</Button>
            </TableCell>
        </TableRow>
    );
});

export default function NormalizacaoKmDialog({ open, veiculo, podeAplicar, onClose, onAplicado }: {
    open: boolean;
    veiculo: ItemFrotaV2;
    podeAplicar: boolean;
    onClose: () => void;
    /** Depois de gravar: o KM último do cadastro (o novo, se ele entrou no lote). */
    onAplicado: (kmUltimo: number | null) => void;
}) {
    const medidor = veiculo.categoria === 'PLACA' ? 'KM' : 'Horímetro';
    const medidorNoTexto = medidor === 'KM' ? 'KM' : 'horímetro';
    const kmUltimo = typeof veiculo.quilometragemUltima === 'number' ? veiculo.quilometragemUltima : null;
    const [leituras, setLeituras] = useState<LeituraKm[] | null>(null);
    const [carregando, setCarregando] = useState(false);
    const [erroCarga, setErroCarga] = useState<string | null>(null);
    const [referencia, setReferencia] = useState('');
    const [rascunhos, setRascunhos] = useState<Map<string, string>>(new Map());
    const [erros, setErros] = useState<Map<string, string>>(new Map());
    const [alteracoes, setAlteracoes] = useState<Map<string, Preparada>>(new Map());
    const [soSinalizados, setSoSinalizados] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const [mensagem, setMensagem] = useState<{ severity: 'success' | 'error' | 'info'; texto: string } | null>(null);

    const carregar = useCallback(async (): Promise<LeituraKm[] | null> => {
        setCarregando(true);
        setErroCarga(null);
        try {
            const lidas = await carregarLeiturasKm(veiculo);
            setLeituras(lidas);
            return lidas;
        } catch (err) {
            console.error('Erro ao carregar leituras do medidor', err);
            setErroCarga('Não foi possível carregar as leituras.');
            return null;
        } finally {
            setCarregando(false);
        }
    }, [veiculo]);

    useEffect(() => {
        if (!open) return;
        setLeituras(null);
        setRascunhos(new Map());
        setErros(new Map());
        setAlteracoes(new Map());
        setMensagem(null);
        setReferencia('');
        void carregar().then((lidas) => {
            const padrao = (lidas && referenciaPadrao(lidas)) ?? kmUltimo;
            setReferencia(padrao === null ? '' : String(padrao));
        });
        // Só ao abrir: depois de aplicar, a recarga é explícita.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const { linha, semData } = useMemo(() => montarLinhaDoTempo(leituras ?? []), [leituras]);
    const kmReferencia = useMemo(() => { const lido = lerNovoKm(referencia); return lido.ok ? lido.valor : null; }, [referencia]);
    const analisadas = useMemo(() => analisarLeituras(linha, { kmReferencia }), [linha, kmReferencia]);
    const visiveis = useMemo(() => (soSinalizados ? analisadas.filter((l) => l.suspeito) : analisadas), [analisadas, soSinalizados]);
    const sinalizados = useMemo(() => analisadas.filter((l) => l.suspeito).length, [analisadas]);

    const chaveUltimo = chaveKm('veiculos-v2', veiculo.id, 'operacional.quilometragemUltima');
    const sugestaoUltimo = sugestaoKmUltimo(kmUltimo, linha, alteracoes);
    const ultima = ultimaLeitura(linha, alteracoes);

    const valorDoCampo = (key: string, sugestao: number | null) =>
        rascunhos.get(key) ?? (alteracoes.has(key) ? String(alteracoes.get(key)!.valorNovo) : sugestao === null ? '' : String(sugestao));

    const alvoUltimo = (): Alvo => ({ collection: 'veiculos-v2', documentId: veiculo.id, field: 'operacional.quilometragemUltima', valorOriginal: kmUltimo as number, rotulo: `${medidor} último (cadastro)`, data: null });

    const mudarRascunho = useCallback((key: string, valor: string) => {
        setRascunhos((atual) => new Map(atual).set(key, valor));
        setErros((atual) => { if (!atual.has(key)) return atual; const novo = new Map(atual); novo.delete(key); return novo; });
    }, []);

    /** Lê o campo e prepara (ou desfaz, se voltou ao original). Devolve a alteração, null sem mudança, ou false com erro. */
    const preparar = (alvo: Alvo, texto: string, destino: Map<string, Preparada>, errosNovos: Map<string, string>): Preparada | null | false => {
        const key = chaveKm(alvo.collection, alvo.documentId, alvo.field);
        const lido = lerNovoKm(texto);
        if (!lido.ok) { errosNovos.set(key, lido.erro); return false; }
        if (lido.valor === alvo.valorOriginal) { destino.delete(key); return null; }
        const preparada: Preparada = { key, ...alvo, valorNovo: lido.valor };
        destino.set(key, preparada);
        return preparada;
    };

    // Estável (só atualizações funcionais), para as linhas memorizadas não renderizarem de novo a cada tecla.
    const salvarUm = useCallback((alvo: Alvo, texto: string) => {
        const key = chaveKm(alvo.collection, alvo.documentId, alvo.field);
        const lido = lerNovoKm(texto);
        setErros((atual) => {
            const novo = new Map(atual);
            if (lido.ok) novo.delete(key); else novo.set(key, lido.erro);
            return novo;
        });
        if (!lido.ok) return;
        setAlteracoes((atual) => {
            const novo = new Map(atual);
            if (lido.valor === alvo.valorOriginal) novo.delete(key);
            else novo.set(key, { key, ...alvo, valorNovo: lido.valor });
            return novo;
        });
    }, []);

    const salvarLeitura = useCallback((l: LeituraAnalisada, texto: string) => salvarUm(alvoDaLeitura(l), texto), [salvarUm]);

    // Todos os campos preenchidos (inclusive sugestões) de uma vez: com um inválido, nada é preparado.
    const salvarTodos = () => {
        const errosNovos = new Map<string, string>();
        const novas = new Map(alteracoes);
        const preparadasAgora = (campos: { alvo: Alvo; texto: string }[]) => campos
            .filter((c) => c.texto.trim() !== '')
            .map((c) => preparar(c.alvo, c.texto, novas, errosNovos))
            .filter((p): p is Preparada => Boolean(p));
        const mudadas = preparadasAgora(analisadas
            .filter((l) => l.valor !== null)
            .map((l) => ({ alvo: alvoDaLeitura(l), texto: valorDoCampo(l.key, sugestaoPorDigitos(l)) })));
        // O KM último depois das leituras: a sugestão dele já considera as correções deste mesmo clique.
        if (kmUltimo !== null) {
            const texto = rascunhos.get(chaveUltimo) ?? (alteracoes.has(chaveUltimo) ? String(alteracoes.get(chaveUltimo)!.valorNovo) : String(sugestaoKmUltimo(kmUltimo, linha, novas) ?? ''));
            mudadas.push(...preparadasAgora([{ alvo: alvoUltimo(), texto }]));
        }
        if (errosNovos.size) {
            setErros(errosNovos);
            setMensagem({ severity: 'error', texto: `${errosNovos.size} valor(es) inválido(s); nenhuma alteração foi preparada.` });
            return;
        }
        if (!mudadas.length) { setMensagem({ severity: 'info', texto: 'Nenhum valor novo para preparar.' }); return; }
        if (!window.confirm(`${mudadas.length} valor(es) preenchido(s) vão para as alterações preparadas.\n\nNada é gravado agora.\n\nContinuar?`)) return;
        setErros(new Map());
        setAlteracoes(novas);
        setMensagem({ severity: 'info', texto: `${mudadas.length} alteração(ões) preparada(s).` });
    };

    const desfazer = (key: string) => {
        setAlteracoes((atual) => { const novo = new Map(atual); novo.delete(key); return novo; });
        setRascunhos((atual) => { const novo = new Map(atual); novo.delete(key); return novo; });
    };

    const aplicar = async () => {
        const lista = [...alteracoes.values()];
        if (!lista.length || aplicando) return;
        if (!window.confirm(`Serão alterados ${lista.length} valor(es) de ${medidorNoTexto}.\n\nAntes de gravar, todos os valores são conferidos de novo, numa única transação.\n\nConfirmar?`)) return;
        setAplicando(true);
        setMensagem({ severity: 'info', texto: 'Gravando…' });
        try {
            const resultado = await aplicarCorrecoesKm(veiculo.id, lista.map(({ key, collection, documentId, field, valorOriginal, valorNovo }) => ({ key, collection, documentId, field, valorOriginal, valorNovo })));
            const novoUltimo = alteracoes.get(chaveUltimo)?.valorNovo ?? kmUltimo;
            setAlteracoes(new Map());
            setRascunhos(new Map());
            onAplicado(novoUltimo);
            await carregar();
            setMensagem({ severity: 'success', texto: `${resultado.alteracoes} alteração(ões) gravada(s) em ${resultado.documentos} registro(s)${resultado.reconciliado ? ' (já estavam gravadas)' : ''}.` });
        } catch (err) {
            console.error('Erro ao aplicar a normalização de KM', err);
            setMensagem({ severity: 'error', texto: `Nada foi gravado: ${err instanceof Error ? err.message : 'erro desconhecido.'}` });
        } finally {
            setAplicando(false);
        }
    };

    const preparadas = [...alteracoes.values()];

    return (
        <Dialog open={open} onClose={() => !aplicando && onClose()} fullWidth maxWidth="lg" scroll="paper">
            <DialogTitle>Normalizar {medidorNoTexto} — {veiculo.identificador}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2}>
                    <Typography variant="body2" color="text.secondary">
                        Leituras das saídas, chegadas e abastecimentos do veículo, da mais antiga para a mais nova. São marcadas as que têm
                        mais dígitos que o {medidorNoTexto} de referência e as menores que a anterior e a próxima. O sistema não decide
                        o valor certo: corrija em "Novo valor", salve e aplique.
                    </Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                        <TextField
                            size="small"
                            label={`${medidor} de referência atual`}
                            value={referencia}
                            onChange={(event) => setReferencia(event.target.value)}
                            helperText="Começa na mediana das leituras; troque pelo valor do painel, se souber."
                            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                        />
                        <FormControlLabel control={<Switch checked={soSinalizados} onChange={(event) => setSoSinalizados(event.target.checked)} />} label="Só sinalizados" />
                        {leituras && (
                            <Typography variant="body2">
                                Leituras: <strong>{analisadas.length}</strong> · Sinalizadas: <strong>{sinalizados}</strong>
                                {semData.length > 0 && <> · Sem data (fora da análise): <strong>{semData.length}</strong></>}
                            </Typography>
                        )}
                    </Stack>

                    {kmUltimo !== null && (
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="subtitle2">{medidor} último (cadastro): {numero.format(kmUltimo)}</Typography>
                                    <Typography variant="body2" color={sugestaoUltimo !== null ? 'warning.main' : 'text.secondary'}>
                                        {sugestaoUltimo !== null
                                            ? `Maior que a última leitura (${numero.format(sugestaoUltimo)}). O app só sobe esse valor; corrija para ele voltar a acompanhar as leituras.`
                                            : `Última leitura: ${ultima === null ? '—' : numero.format(ultima)}.`}
                                    </Typography>
                                </Box>
                                <TextField
                                    size="small"
                                    value={valorDoCampo(chaveUltimo, sugestaoUltimo)}
                                    placeholder="Novo valor"
                                    onChange={(event) => mudarRascunho(chaveUltimo, event.target.value)}
                                    error={erros.has(chaveUltimo)}
                                    helperText={erros.get(chaveUltimo) ?? (alteracoes.has(chaveUltimo) ? 'Preparado' : !rascunhos.has(chaveUltimo) && sugestaoUltimo !== null ? 'Sugestão' : undefined)}
                                    disabled={!podeAplicar}
                                    slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-label': `Novo ${medidor} último` } }}
                                />
                                <Button size="small" onClick={() => salvarUm(alvoUltimo(), valorDoCampo(chaveUltimo, sugestaoUltimo))} disabled={!podeAplicar}>Salvar</Button>
                            </Stack>
                        </Paper>
                    )}

                    {carregando && <Box display="flex" justifyContent="center" py={3}><CircularProgress size={28} /></Box>}
                    {erroCarga && <Alert severity="error">{erroCarga}</Alert>}
                    {leituras && !carregando && (
                        analisadas.length === 0 ? (
                            <Typography variant="body2">Nenhuma leitura com data.</Typography>
                        ) : (
                            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 480 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Data</TableCell>
                                            <TableCell>Origem</TableCell>
                                            <TableCell align="right">{medidor} guardado</TableCell>
                                            <TableCell>Alerta</TableCell>
                                            <TableCell>Novo valor</TableCell>
                                            <TableCell />
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {visiveis.map((l) => {
                                            const sugestao = sugestaoPorDigitos(l);
                                            return (
                                                <LinhaLeitura
                                                    key={l.key}
                                                    leitura={l}
                                                    valor={valorDoCampo(l.key, sugestao)}
                                                    sugerido={!rascunhos.has(l.key) && !alteracoes.has(l.key) && sugestao !== null}
                                                    preparado={alteracoes.has(l.key)}
                                                    erro={erros.get(l.key)}
                                                    podeEditar={podeAplicar}
                                                    onChange={mudarRascunho}
                                                    onSalvar={salvarLeitura}
                                                />
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )
                    )}

                    {podeAplicar ? (
                        <Box>
                            <Button variant="outlined" onClick={salvarTodos} disabled={!leituras || aplicando}>Salvar todos</Button>
                        </Box>
                    ) : (
                        <Alert severity="info">Só a Logística e o adm2 gravam correções de {medidorNoTexto}.</Alert>
                    )}

                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>Alterações preparadas ({preparadas.length})</Typography>
                        {preparadas.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">Nenhuma alteração.</Typography>
                        ) : (
                            <Stack spacing={0.5}>
                                {preparadas.map((p) => (
                                    <Stack key={p.key} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                                        <Typography variant="body2">
                                            {p.data ? dataHora.format(p.data) : '—'} · {p.rotulo} · {numero.format(p.valorOriginal)} → <strong>{numero.format(p.valorNovo)}</strong>
                                        </Typography>
                                        <Button size="small" onClick={() => desfazer(p.key)} disabled={aplicando}>Desfazer</Button>
                                    </Stack>
                                ))}
                            </Stack>
                        )}
                    </Paper>
                    {mensagem && <Alert severity={mensagem.severity} role="status">{mensagem.texto}</Alert>}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={aplicando}>Fechar</Button>
                {podeAplicar && (
                    <Button variant="contained" onClick={() => void aplicar()} disabled={aplicando || preparadas.length === 0}>
                        {aplicando ? 'Gravando…' : preparadas.length ? `Aplicar ${preparadas.length} alteraç${preparadas.length === 1 ? 'ão' : 'ões'}` : 'Aplicar alterações'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
