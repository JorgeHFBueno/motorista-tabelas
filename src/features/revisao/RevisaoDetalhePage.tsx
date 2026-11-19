import { Alert, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PaginaMotorista from '../saida-chegada/components/PaginaMotorista';
import { carregarRegistro } from './data/armazenamentoLocal';
import { obterRevisao } from './data/revisaoFirestore';
import type { RevisaoLida } from './domain/documento';
import { tituloDe, TIPOS } from './domain/listas';
import { estaAberta, exibirDia, horimetroDe } from './domain/registro';
import { resumoDoItem, versaoParaEditar } from './domain/regras';
import { FotoItem } from './components/Fotos';
import ChipStatus from './components/ChipStatus';

/** /motorista/revisao/historico/:id: um registro enviado, com os itens e as fotos; aberto, pode ser continuado aqui. */
export default function RevisaoDetalhePage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [lida, setLida] = useState<RevisaoLida | null | undefined>(undefined);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    obterRevisao(id)
      .then((l) => ativo && setLida(l))
      .catch((error) => {
        console.error('Revisão: falha ao carregar', error);
        if (ativo) setErro(true);
      });
    return () => { ativo = false; };
  }, [id]);

  const continuar = async (l: RevisaoLida) => {
    const local = await carregarRegistro(l.registro.id).catch(() => null);
    navigate(`/motorista/revisao/${encodeURIComponent(l.registro.id)}`, { state: { registro: versaoParaEditar(local, l.registro) } });
  };

  if (erro) return <PaginaMotorista><Alert severity="error">Não foi possível carregar a revisão.</Alert></PaginaMotorista>;
  if (lida === undefined) return <PaginaMotorista><Stack alignItems="center" sx={{ py: 6 }}><CircularProgress /></Stack></PaginaMotorista>;
  if (lida === null) return <PaginaMotorista><Alert severity="warning">Revisão não encontrada.</Alert></PaginaMotorista>;

  const r = lida.registro;
  const medidor = `${horimetroDe(r.veiculo) ? 'Horímetro' : 'KM'} ${r.medidor?.toLocaleString('pt-BR') ?? '-'}${r.medidorCorrigido ? ' (corrigido pelo mecânico)' : ''}`;
  return (
    <PaginaMotorista>
      <Stack spacing={1.5}>
        <Typography variant="h5" fontWeight={800}>{r.veiculo.identificador} · {tituloDe(TIPOS, r.tipo) ?? ''}</Typography>
        <Card variant="outlined">
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1} sx={{ mb: 1 }}>
              <Typography>{r.veiculo.nome || r.veiculo.identificador}</Typography>
              <ChipStatus registro={r} />
            </Stack>
            <Typography variant="body2">Motivo: {r.motivo.trim() || '-'}</Typography>
            {r.dataParada && <Typography variant="body2">Parou em {exibirDia(r.dataParada)}</Typography>}
            <Typography variant="body2">Foi ao mecânico em {r.dataEntrada ? exibirDia(r.dataEntrada) : '-'}</Typography>
            {r.dataRetorno && <Typography variant="body2">Voltou em {exibirDia(r.dataRetorno)}</Typography>}
            <Typography variant="body2">{medidor}</Typography>
            {r.numeroNota.trim() && <Typography variant="body2">Nº da nota: {r.numeroNota.trim()}</Typography>}
            {lida.criadoPorNome && <Typography variant="body2">Aberta por {lida.criadoPorNome}</Typography>}
            {lida.fechadoPorNome && <Typography variant="body2">Fechada por {lida.fechadoPorNome}</Typography>}
          </CardContent>
        </Card>
        {estaAberta(r) && (
          <Button variant="contained" size="large" startIcon={<EditOutlinedIcon />} onClick={() => void continuar(lida)} sx={{ minHeight: 52, fontWeight: 700 }}>
            Continuar esta revisão
          </Button>
        )}
        <Typography variant="h6" sx={{ pt: 1 }}>Itens ({r.itens.length})</Typography>
        {r.itens.length === 0 && <Typography color="text.secondary">Nenhum item lançado ainda.</Typography>}
        {r.itens.map((i) => (
          <Card key={i.itemId} variant="outlined">
            <CardContent>
              <Typography fontWeight={700}>{resumoDoItem(i)}</Typography>
              {i.motivo && <Typography variant="body2">Motivo: {i.motivo}</Typography>}
              {i.especificacao.trim() && <Typography variant="body2">{i.especificacao.trim()}</Typography>}
              {i.numeroNota.trim() && <Typography variant="body2">Nº da nota: {i.numeroNota.trim()}</Typography>}
              {i.fotos.length > 0 && (
                <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap', mt: 1 }}>
                  {i.fotos.map((f) => <FotoItem key={f.arquivo} foto={f} />)}
                </Stack>
              )}
            </CardContent>
          </Card>
        ))}
      </Stack>
    </PaginaMotorista>
  );
}
