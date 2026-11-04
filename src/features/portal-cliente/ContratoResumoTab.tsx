import { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Snackbar, Stack, TextField, Typography } from '@mui/material';
import type { ObraDetalhe } from '../obras/obrasDomain';
import { localPendente } from '../obras/obrasDomain';
import { contratoTemAtendimentos, salvarResumo } from './contratosPortalData';
import { usePessoaAtual } from './portalArquivos';
import {
  centavosParaTexto,
  dataIsoValida,
  formatarCentavos,
  formatarDocumento,
  normalizarDocumento,
  reaisParaCentavos,
  type ContratoPortal,
} from './portalDominio';

// Resumo of a published contract: what the client sees at the top of the contract (portal-obras, The Manuscript
// portal.md). nome, local and numeroContrato are copies of obras-v2 made at publishing; they do not follow it alone.

type Formulario = { nome: string; local: string; numeroContrato: string; inicio: string; fim: string; valor: string; documento: string };

const formularioDe = (contrato: ContratoPortal): Formulario => ({
  nome: contrato.nome,
  local: contrato.local ?? '',
  numeroContrato: contrato.numeroContrato ?? '',
  inicio: contrato.previsao.inicio ?? '',
  fim: contrato.previsao.fim ?? '',
  valor: centavosParaTexto(contrato.valorContrato),
  documento: formatarDocumento(contrato.clienteDocumento),
});

export default function ContratoResumoTab({ contrato, obra }: { contrato: ContratoPortal; obra: ObraDetalhe | null }) {
  const pessoa = usePessoaAtual();
  const [form, setForm] = useState<Formulario>(() => formularioDe(contrato));
  const [temAtendimentos, setTemAtendimentos] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    contratoTemAtendimentos(contrato.id)
      .then((tem) => { if (ativo) setTemAtendimentos(tem); })
      .catch((err) => console.error('Erro ao conferir os atendimentos do contrato', err));
    return () => { ativo = false; };
  }, [contrato.id]);

  const campo = (chave: keyof Formulario) => ({
    value: form[chave],
    onChange: (event: { target: { value: string } }) => setForm((atual) => ({ ...atual, [chave]: event.target.value })),
    disabled: salvando,
    fullWidth: true,
  });

  const documento = normalizarDocumento(form.documento);
  const valorDigitado = form.valor.trim();
  const valor = reaisParaCentavos(valorDigitado);
  const valorInvalido = !!valorDigitado && valor === null;
  const datasInvalidas = (!!form.inicio && !dataIsoValida(form.inicio)) || (!!form.fim && !dataIsoValida(form.fim));
  const fimAntes = !!form.inicio && !!form.fim && form.fim < form.inicio;
  const documentoMudou = !!documento && documento !== contrato.clienteDocumento;
  const invalido = !form.nome.trim() || !documento || valorInvalido || datasInvalidas || fimAntes;

  const copiarDeObras = () => {
    if (!obra) return;
    setForm((atual) => ({
      ...atual,
      nome: obra.nomeObra,
      local: localPendente(obra.local) ? '' : obra.local,
      numeroContrato: obra.numeroContrato,
    }));
  };

  const salvar = async () => {
    if (!pessoa || !documento || invalido) return;
    if (documentoMudou && !window.confirm(
      `Trocar o cliente de ${formatarDocumento(contrato.clienteDocumento)} para ${formatarDocumento(documento)}? `
      + 'Os logins do CNPJ/CPF antigo deixam de ver o contrato, e os documentos, fotos e parcelas passam para o novo.',
    )) return;
    setSalvando(true);
    setErro(null);
    try {
      const atualizados = await salvarResumo(contrato.id, contrato.clienteDocumento, {
        clienteDocumento: documento,
        nome: form.nome.trim(),
        local: form.local.trim() || null,
        numeroContrato: form.numeroContrato.trim() || null,
        previsao: { inicio: form.inicio || null, fim: form.fim || null },
        valorContrato: valor,
      }, pessoa);
      setForm((atual) => ({ ...atual, documento: formatarDocumento(documento), valor: centavosParaTexto(valor) }));
      setAviso(atualizados ? `Resumo salvo. ${atualizados} registro(s) passaram para o novo CNPJ/CPF.` : 'Resumo salvo.');
    } catch (err) {
      console.error('Erro ao salvar o resumo do contrato', err);
      setErro(err instanceof Error && err.message ? err.message : 'Não foi possível salvar o resumo.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2.5}>
        <Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
            <Typography variant="h6">Dados do contrato no portal</Typography>
            <Button variant="outlined" size="small" onClick={copiarDeObras} disabled={!obra || salvando}>
              Copiar de novo de obras-v2
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Nome, local e número do contrato são cópias de obras-v2 feitas na publicação; uma mudança em obras-v2 não chega
            sozinha ao portal. "Copiar de novo" preenche os três campos com os valores atuais de obras-v2; nada é gravado até salvar.
          </Typography>
        </Box>

        <TextField label="Nome exibido ao cliente" required {...campo('nome')} error={!form.nome.trim()} helperText={!form.nome.trim() ? 'Informe o nome.' : undefined} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Local" {...campo('local')} />
          <TextField label="Número do contrato" {...campo('numeroContrato')} />
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="Previsão de início" type="date" {...campo('inicio')} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField
            label="Previsão de término"
            type="date"
            {...campo('fim')}
            error={fimAntes}
            helperText={fimAntes ? 'O término vem antes do início.' : undefined}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
        <TextField
          label="Valor do contrato (R$)"
          placeholder="Ex.: 1.234.567,89"
          {...campo('valor')}
          error={valorInvalido}
          helperText={valorInvalido ? 'Valor inválido. Use, por exemplo, 1.234.567,89.' : valor !== null ? formatarCentavos(valor) : 'Vazio: o portal mostra a soma das parcelas.'}
        />
        <TextField
          label="CNPJ/CPF do cliente"
          required
          {...campo('documento')}
          disabled={salvando || temAtendimentos === true}
          onBlur={() => { if (documento) setForm((atual) => ({ ...atual, documento: formatarDocumento(documento) })); }}
          error={!documento}
          helperText={
            temAtendimentos
              ? 'Este contrato tem atendimentos, presos ao CNPJ/CPF com que foram abertos: o CNPJ/CPF não pode mudar.'
              : !documento
                ? 'CNPJ (14 dígitos) ou CPF (11 dígitos) com dígitos verificadores válidos.'
                : 'Os logins com este CNPJ/CPF veem o contrato. Ao trocar, os documentos, fotos e parcelas acompanham.'
          }
        />

        {erro && <Alert severity="error">{erro}</Alert>}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Um contrato publicado não pode ser retirado do portal (as regras do Firestore não permitem excluir).
          </Typography>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => { setForm(formularioDe(contrato)); setErro(null); }} disabled={salvando}>Descartar</Button>
            <Button variant="contained" onClick={() => void salvar()} disabled={salvando || invalido || !pessoa}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
          </Stack>
        </Stack>
      </Stack>
      <Snackbar open={!!aviso} autoHideDuration={4000} onClose={() => setAviso(null)} message={aviso} />
    </Paper>
  );
}
