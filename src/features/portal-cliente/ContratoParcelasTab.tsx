import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  IconButton,
  Link,
  Paper,
  Stack,
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
import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { centavosParaTexto, formatarCentavos, formatarDataIso, LIMITES_ARQUIVO, type ArquivoPortal, type ContratoPortal } from './portalDominio';
import { abrirArquivo, usePessoaAtual } from './portalArquivos';
import {
  confirmarPagamento,
  criarParcela,
  editarParcela,
  listarParcelas,
  moverParcelaParaLixeira,
  recusarComprovante,
  restaurarParcela,
  trocarBoleto,
  type ParcelaContrato,
} from './parcelasDados';
import {
  ROTULOS_STATUS_PARCELA,
  ehPdfOuImagem,
  filtrarLixeira,
  formatarDataHora,
  lerTexto,
  mensagemDeErro,
  proximoNumeroParcela,
  resumirParcelas,
  validarFormParcela,
  type DadosParcela,
  type FormParcela,
  type StatusParcela,
} from './contratoConteudoDominio';
import { AvisoSnackbar, CabecalhoAba, SeletorArquivo, Vazio, type Aviso } from './contratoAbasComum';

// Installments of the contract (portal-parcelas), typed by adm2: boleto, checking the client's receipt
// (pago / rejeitado) and trash. Values in cents.

const CORES_STATUS: Record<StatusParcela, 'default' | 'info' | 'success' | 'error'> = {
  pendente: 'default',
  comprovante_enviado: 'info',
  pago: 'success',
  rejeitado: 'error',
};

const ACEITA_BOLETO = 'application/pdf,image/*';

type DialogoParcela =
  | { tipo: 'nova' }
  | { tipo: 'editar'; parcela: ParcelaContrato }
  | { tipo: 'confirmar'; parcela: ParcelaContrato }
  | { tipo: 'recusar'; parcela: ParcelaContrato }
  | null;

function Campo({ rotulo, valor, detalhe }: { rotulo: string; valor: ReactNode; detalhe?: string }) {
  return (
    <Box minWidth={0}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{valor}</Typography>
      {detalhe && <Typography variant="caption" color="text.secondary">{detalhe}</Typography>}
    </Box>
  );
}

export default function ContratoParcelasTab({ contrato }: { contrato: ContratoPortal }) {
  const pessoa = usePessoaAtual();
  const [parcelas, setParcelas] = useState<ParcelaContrato[] | null>(null);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);
  const [lixeira, setLixeira] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<DialogoParcela>(null);
  const [aviso, setAviso] = useState<Aviso>(null);

  useEffect(() => {
    let ativo = true;
    listarParcelas(contrato.id)
      .then((itens) => { if (ativo) { setParcelas(itens); setErro(false); } })
      .catch((err) => {
        console.error('Erro ao carregar as parcelas do contrato', err);
        if (ativo) setErro(true);
      });
    return () => { ativo = false; };
  }, [contrato.id, versao]);

  const resumo = useMemo(() => resumirParcelas(parcelas ?? [], contrato.valorContrato), [contrato.valorContrato, parcelas]);
  const visiveis = useMemo(() => filtrarLixeira(parcelas ?? [], lixeira), [lixeira, parcelas]);
  const quantidadeLixeira = parcelas ? filtrarLixeira(parcelas, true).length : 0;

  const recarregar = (mensagem: string) => {
    setAviso({ severity: 'success', message: mensagem });
    setVersao((v) => v + 1);
  };

  async function acao(parcela: ParcelaContrato, executar: () => Promise<void>, sucesso: string, falha: string) {
    setOcupado(parcela.id);
    try {
      await executar();
      recarregar(sucesso);
    } catch (err) {
      console.error(falha, err);
      setAviso({ severity: 'error', message: mensagemDeErro(err, `${falha} Tente novamente.`) });
    } finally {
      setOcupado(null);
    }
  }

  async function abrir(arquivo: ArquivoPortal | null) {
    if (!(await abrirArquivo(arquivo))) setAviso({ severity: 'error', message: 'Não foi possível abrir o arquivo.' });
  }

  const enviarBoleto = (parcela: ParcelaContrato, arquivo: File) =>
    acao(parcela, () => trocarBoleto(contrato.id, parcela.id, arquivo), 'Boleto enviado.', 'Não foi possível enviar o boleto.');

  const alternarLixeira = (parcela: ParcelaContrato) => {
    if (!pessoa) return;
    if (parcela.excluidoEm) {
      void acao(parcela, () => restaurarParcela(parcela.id), 'Parcela restaurada.', 'Não foi possível restaurar a parcela.');
    } else {
      void acao(parcela, () => moverParcelaParaLixeira(parcela.id, pessoa), 'Parcela movida para a lixeira.', 'Não foi possível mover a parcela.');
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <CabecalhoAba titulo="Parcelas" lixeira={lixeira} quantidadeLixeira={quantidadeLixeira} onAlternarLixeira={() => setLixeira((v) => !v)}>
        {!lixeira && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogo({ tipo: 'nova' })} disabled={!pessoa || !parcelas}>Nova parcela</Button>
        )}
      </CabecalhoAba>

      {parcelas && !lixeira && (
        <>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(0, 1fr))' }, mb: 2 }}>
            <Campo
              rotulo="Valor do contrato"
              valor={formatarCentavos(resumo.totalContrato)}
              detalhe={resumo.valorContrato === null ? 'Não informado: soma das parcelas' : undefined}
            />
            <Campo rotulo="Soma das parcelas" valor={formatarCentavos(resumo.somaParcelas)} detalhe={`${resumo.quantidade} parcela(s)`} />
            <Campo rotulo="Pago" valor={formatarCentavos(resumo.pago)} detalhe={`${resumo.pagas} parcela(s)`} />
            <Campo rotulo="Em aberto" valor={formatarCentavos(resumo.emAberto)} />
            <Campo rotulo="Comprovantes a conferir" valor={resumo.aConferir} />
          </Box>
          {resumo.diferenca !== null && resumo.diferenca !== 0 && resumo.quantidade > 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              A soma das parcelas ({formatarCentavos(resumo.somaParcelas)}) é diferente do valor do contrato ({formatarCentavos(resumo.valorContrato)}).
            </Alert>
          )}
        </>
      )}

      {erro ? (
        <Alert severity="error">Não foi possível carregar as parcelas.</Alert>
      ) : !parcelas ? (
        <Box display="flex" justifyContent="center" py={3}><CircularProgress size={24} /></Box>
      ) : !visiveis.length ? (
        <Vazio>{lixeira ? 'Nenhuma parcela na lixeira.' : 'Nenhuma parcela cadastrada.'}</Vazio>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Nº', 'Descrição', 'Vencimento', 'Valor', 'Status', 'Boleto', 'Comprovante'].map((titulo) => (
                  <TableCell key={titulo} sx={{ fontWeight: 700 }} align={titulo === 'Valor' ? 'right' : 'left'}>{titulo}</TableCell>
                ))}
                <TableCell sx={{ fontWeight: 700 }} align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visiveis.map((parcela) => {
                const travada = !pessoa || ocupado === parcela.id;
                return (
                  <TableRow key={parcela.id} sx={{ verticalAlign: 'top' }}>
                    <TableCell sx={{ fontWeight: 600 }}>{parcela.numero}</TableCell>
                    <TableCell sx={{ minWidth: 140 }}>{parcela.descricao ?? `Parcela ${parcela.numero}`}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatarDataIso(parcela.vencimento)}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatarCentavos(parcela.valor)}</TableCell>
                    <TableCell sx={{ minWidth: 170 }}>
                      <Chip label={ROTULOS_STATUS_PARCELA[parcela.status]} color={CORES_STATUS[parcela.status]} size="small" />
                      {parcela.conferidoEm && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Conferido em {formatarDataHora(parcela.conferidoEm)}{parcela.conferidoPor?.nome ? ` · ${parcela.conferidoPor.nome}` : ''}
                        </Typography>
                      )}
                      {parcela.observacaoAdmin && (
                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}>Para o cliente: {parcela.observacaoAdmin}</Typography>
                      )}
                      {lixeira && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          Na lixeira desde {formatarDataHora(parcela.excluidoEm)}{parcela.excluidoPor?.nome ? ` · ${parcela.excluidoPor.nome}` : ''}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Stack spacing={0.5} alignItems="flex-start">
                        {parcela.boleto && <Link component="button" variant="body2" onClick={() => abrir(parcela.boleto)}>Abrir boleto</Link>}
                        {!lixeira && (
                          <Button component="label" size="small" disabled={travada}>
                            {parcela.boleto ? 'Trocar' : 'Enviar boleto'}
                            <input
                              hidden
                              type="file"
                              accept={ACEITA_BOLETO}
                              onChange={(event) => {
                                const arquivo = event.target.files?.[0];
                                event.target.value = '';
                                if (arquivo) void enviarBoleto(parcela, arquivo);
                              }}
                            />
                          </Button>
                        )}
                        {!parcela.boleto && lixeira && '—'}
                      </Stack>
                    </TableCell>
                    <TableCell sx={{ minWidth: 160 }}>
                      {parcela.comprovante ? (
                        <>
                          <Link component="button" variant="body2" onClick={() => abrir(parcela.comprovante)}>Abrir comprovante</Link>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {formatarDataHora(parcela.comprovanteEnviadoEm)}{parcela.comprovanteEnviadoPor?.nome ? ` · ${parcela.comprovanteEnviadoPor.nome}` : ''}
                          </Typography>
                          {parcela.observacaoCliente && (
                            <Typography variant="caption" sx={{ display: 'block', overflowWrap: 'anywhere' }}>Cliente: {parcela.observacaoCliente}</Typography>
                          )}
                        </>
                      ) : '—'}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {!lixeira && (
                        <>
                          <Tooltip title="Editar">
                            <span><IconButton size="small" onClick={() => setDialogo({ tipo: 'editar', parcela })} disabled={travada}><EditOutlinedIcon fontSize="small" /></IconButton></span>
                          </Tooltip>
                          {parcela.status !== 'pago' && (
                            <Tooltip title="Confirmar pagamento">
                              <span><IconButton size="small" color="success" onClick={() => setDialogo({ tipo: 'confirmar', parcela })} disabled={travada}><CheckCircleOutlineIcon fontSize="small" /></IconButton></span>
                            </Tooltip>
                          )}
                          {parcela.status === 'comprovante_enviado' && (
                            <Tooltip title="Recusar comprovante">
                              <span><IconButton size="small" color="error" onClick={() => setDialogo({ tipo: 'recusar', parcela })} disabled={travada}><BlockIcon fontSize="small" /></IconButton></span>
                            </Tooltip>
                          )}
                        </>
                      )}
                      <Tooltip title={lixeira ? 'Restaurar' : 'Mover para a lixeira'}>
                        <span>
                          <IconButton size="small" onClick={() => alternarLixeira(parcela)} disabled={travada}>
                            {lixeira ? <RestoreFromTrashIcon fontSize="small" /> : <DeleteOutlineIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {lixeira && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          O cliente não vê as parcelas da lixeira, e elas não entram nos totais. Restaurar volta a parcela para o portal.
        </Typography>
      )}

      {pessoa && (dialogo?.tipo === 'nova' || dialogo?.tipo === 'editar') && (
        <ParcelaDialog
          parcela={dialogo.tipo === 'editar' ? dialogo.parcela : null}
          numeroSugerido={proximoNumeroParcela(parcelas ?? [])}
          onClose={() => setDialogo(null)}
          onSalvar={async (dados, boleto) => {
            if (dialogo.tipo === 'editar') await editarParcela(dialogo.parcela.id, dados);
            else await criarParcela(contrato, dados, boleto);
            setDialogo(null);
            recarregar(dialogo.tipo === 'editar' ? 'Parcela salva.' : 'Parcela criada.');
          }}
        />
      )}

      {pessoa && dialogo?.tipo === 'confirmar' && (
        <ObservacaoDialog
          titulo={`Confirmar pagamento da parcela ${dialogo.parcela.numero}`}
          texto={
            dialogo.parcela.comprovante
              ? 'A parcela fica como paga no portal.'
              : 'O cliente não enviou comprovante. A parcela fica como paga no portal.'
          }
          rotuloCampo="Observação para o cliente (opcional)"
          valorInicial={dialogo.parcela.observacaoAdmin ?? ''}
          obrigatorio={false}
          rotuloBotao="Confirmar pagamento"
          onClose={() => setDialogo(null)}
          onSalvar={async (observacao) => {
            await confirmarPagamento(dialogo.parcela.id, pessoa, observacao);
            setDialogo(null);
            recarregar('Pagamento confirmado.');
          }}
        />
      )}

      {pessoa && dialogo?.tipo === 'recusar' && (
        <ObservacaoDialog
          titulo={`Recusar comprovante da parcela ${dialogo.parcela.numero}`}
          texto="O cliente vê o motivo no portal e pode enviar um novo comprovante."
          rotuloCampo="Motivo da recusa"
          valorInicial=""
          obrigatorio
          rotuloBotao="Recusar comprovante"
          onClose={() => setDialogo(null)}
          onSalvar={async (motivo) => {
            if (!motivo) return;
            await recusarComprovante(dialogo.parcela.id, pessoa, motivo);
            setDialogo(null);
            recarregar('Comprovante recusado.');
          }}
        />
      )}

      <AvisoSnackbar aviso={aviso} onClose={() => setAviso(null)} />
    </Paper>
  );
}

function ParcelaDialog({
  parcela,
  numeroSugerido,
  onClose,
  onSalvar,
}: {
  parcela: ParcelaContrato | null;
  numeroSugerido: number;
  onClose: () => void;
  onSalvar: (dados: DadosParcela, boleto: File | null) => Promise<void>;
}) {
  const [form, setForm] = useState<FormParcela>(() => ({
    numero: String(parcela?.numero ?? numeroSugerido),
    descricao: parcela?.descricao ?? '',
    valor: parcela ? centavosParaTexto(parcela.valor) : '',
    vencimento: parcela?.vencimento ?? '',
    observacaoAdmin: parcela?.observacaoAdmin ?? '',
  }));
  const [boleto, setBoleto] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const campo = (nome: keyof FormParcela) => ({
    value: form[nome],
    onChange: (event: { target: { value: string } }) => setForm((atual) => ({ ...atual, [nome]: event.target.value })),
    disabled: salvando,
  });

  const boletoInvalido = Boolean(boleto && (!ehPdfOuImagem(boleto.type) || boleto.size > LIMITES_ARQUIVO.boleto));

  async function salvar() {
    const validado = validarFormParcela(form);
    if (!validado.ok) { setErro(validado.erro); return; }
    if (boletoInvalido) { setErro('O boleto deve ser um PDF ou uma imagem de até 10 MB.'); return; }
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(validado.dados, boleto);
    } catch (err) {
      console.error('Erro ao salvar a parcela', err);
      setErro(mensagemDeErro(err, 'Não foi possível salvar a parcela. Tente novamente.'));
      setSalvando(false);
    }
  }

  return (
    <Dialog open onClose={salvando ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{parcela ? `Editar parcela ${parcela.numero}` : 'Nova parcela'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Número" {...campo('numero')} required slotProps={{ htmlInput: { inputMode: 'numeric' } }} sx={{ width: { sm: 120 } }} />
            <TextField label="Valor (R$)" {...campo('valor')} required placeholder="1.234,56" slotProps={{ htmlInput: { inputMode: 'decimal' } }} fullWidth />
            <TextField label="Vencimento" type="date" {...campo('vencimento')} required slotProps={{ inputLabel: { shrink: true } }} fullWidth />
          </Stack>
          <TextField label="Descrição" {...campo('descricao')} placeholder="Ex.: Entrada, Medição 1" />
          <TextField label="Observação para o cliente" {...campo('observacaoAdmin')} multiline minRows={2} helperText="Aparece para o cliente no portal." />
          {!parcela && (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Boleto (opcional; pode ser enviado depois)</Typography>
              <SeletorArquivo arquivo={boleto} onChange={setBoleto} accept={ACEITA_BOLETO} limiteBytes={LIMITES_ARQUIVO.boleto} rotulo="Escolher boleto" disabled={salvando} />
            </Box>
          )}
          {erro && <Alert severity="error">{erro}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button variant="contained" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ObservacaoDialog({
  titulo,
  texto,
  rotuloCampo,
  valorInicial,
  obrigatorio,
  rotuloBotao,
  onClose,
  onSalvar,
}: {
  titulo: string;
  texto: string;
  rotuloCampo: string;
  valorInicial: string;
  obrigatorio: boolean;
  rotuloBotao: string;
  onClose: () => void;
  onSalvar: (observacao: string | null) => Promise<void>;
}) {
  const [observacao, setObservacao] = useState(valorInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valor = lerTexto(observacao);

  async function salvar() {
    if (obrigatorio && !valor) return;
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(valor);
    } catch (err) {
      console.error(titulo, err);
      setErro(mensagemDeErro(err, 'Não foi possível salvar. Tente novamente.'));
      setSalvando(false);
    }
  }

  return (
    <Dialog open onClose={salvando ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{titulo}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography variant="body2">{texto}</Typography>
          <TextField
            label={rotuloCampo}
            value={observacao}
            onChange={(event) => setObservacao(event.target.value)}
            required={obrigatorio}
            multiline
            minRows={2}
            disabled={salvando}
            autoFocus
            helperText="Aparece para o cliente no portal."
          />
          {erro && <Alert severity="error">{erro}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={salvando}>Cancelar</Button>
        <Button variant="contained" onClick={salvar} disabled={salvando || (obrigatorio && !valor)}>{salvando ? 'Salvando...' : rotuloBotao}</Button>
      </DialogActions>
    </Dialog>
  );
}
