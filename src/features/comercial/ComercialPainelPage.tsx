import { useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import {
  FILTRO_INICIAL, anosDisponiveis, filtrarNegocios, formatarMoeda, formatarMoedaCurta, formatarPercentual, hojeBrasilia,
  resumoPainel, type FiltroNegocios, type LinhaPainel,
} from './comercialDominio';
import FiltrosComercial from './FiltrosComercial';
import { useComercial } from './useComercial';

// Painel do Comercial: indicadores do funil para os filtros escolhidos (começa no ano corrente, em Brasília).
export default function ComercialPainelPage() {
  const { negocios, pessoas, nomes, erro } = useComercial();
  const [filtro, setFiltro] = useState<FiltroNegocios>(() => ({ ...FILTRO_INICIAL, ano: Number(hojeBrasilia().slice(0, 4)) }));
  const anos = useMemo(() => {
    const lista = anosDisponiveis(negocios ?? []);
    return typeof filtro.ano === 'number' && !lista.includes(filtro.ano) ? [filtro.ano, ...lista] : lista;
  }, [negocios, filtro.ano]);
  const r = useMemo(() => resumoPainel(filtrarNegocios(negocios ?? [], filtro), filtro.segmento, nomes), [negocios, filtro, nomes]);

  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <FiltrosComercial filtro={filtro} onChange={setFiltro} anos={anos} pessoas={pessoas} />
      {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
      {!negocios ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gap: 1.5, mt: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', lg: 'repeat(6, 1fr)' } }}>
            <Indicador titulo="Em negociação" valor={formatarMoedaCurta(r.abertos.valor)} detalhe={`${r.abertos.quantidade} negócios abertos`} />
            <Indicador titulo="Propostas enviadas" valor={String(r.propostas.quantidade)} detalhe={formatarMoedaCurta(r.propostas.valor)} />
            <Indicador titulo="Ganhos" valor={formatarMoedaCurta(r.ganhos.valor)} detalhe={`${r.ganhos.quantidade} negócios`} cor="#2E9D6F" />
            <Indicador titulo="Perdidos" valor={String(r.perdidos.quantidade)} detalhe={formatarMoedaCurta(r.perdidos.valor)} cor="#C13B3B" />
            <Indicador titulo="Taxa de conversão" valor={formatarPercentual(r.conversao)} detalhe="ganhos ÷ (ganhos + perdidos)" />
            <Indicador titulo="Ticket médio" valor={formatarMoedaCurta(r.ticketMedio)}
              detalhe={r.cicloMedio ? `ciclo médio de ${r.cicloMedio.dias} dias (${r.cicloMedio.base} com fechamento)` : 'ciclo: sem data de fechamento'} />
          </Box>

          <Box sx={{ display: 'grid', gap: 1.5, mt: 1.5, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
            <Quadro titulo="Funil por etapa" subtitulo="quantidade e valor em cada etapa">
              <Barras linhas={r.porEtapa} />
            </Quadro>
            <Quadro titulo="Negócios criados por mês">
              <Barras linhas={r.porMes} semValor />
            </Quadro>
            <Quadro titulo="Por origem" subtitulo="de onde vêm os negócios e quantos viram ganho">
              <Barras linhas={r.porOrigem} comGanhos />
            </Quadro>
            <Quadro titulo="Por responsável">
              <Barras linhas={r.porResponsavel} comGanhos />
            </Quadro>
            <Quadro titulo="Perdas por motivo" subtitulo={r.porMotivo.some((l) => !l.id) ? 'informe o motivo ao marcar Perdido para esta análise valer' : undefined}>
              <Barras linhas={r.porMotivo} />
            </Quadro>
            <Quadro titulo="Privado × Público">
              <Barras linhas={r.porSegmento} comGanhos />
            </Quadro>
          </Box>
          <Typography variant="caption" color="text.secondary" display="block" mt={2}>
            {r.total.quantidade} negócios nos filtros, somando {formatarMoeda(r.total.valor)}. Ganho inclui Pós-venda; a lixeira fica de fora.
          </Typography>
        </>
      )}
    </Container>
  );
}

function Indicador({ titulo, valor, detalhe, cor }: { titulo: string; valor: string; detalhe?: string; cor?: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary">{titulo}</Typography>
      <Typography variant="h5" sx={{ color: cor, fontVariantNumeric: 'tabular-nums' }}>{valor}</Typography>
      {detalhe && <Typography variant="caption" color="text.secondary">{detalhe}</Typography>}
    </Paper>
  );
}

function Quadro({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={700}>{titulo}</Typography>
      {subtitulo && <Typography variant="caption" color="text.secondary">{subtitulo}</Typography>}
      <Box mt={1.5}>{children}</Box>
    </Paper>
  );
}

/** Barras horizontais: comprimento pela quantidade; à direita, quantidade, ganhos e valor. */
function Barras({ linhas, semValor, comGanhos }: { linhas: LinhaPainel[]; semValor?: boolean; comGanhos?: boolean }) {
  const max = Math.max(1, ...linhas.map((l) => l.quantidade));
  if (!linhas.some((l) => l.quantidade)) return <Typography variant="body2" color="text.secondary">Nenhum negócio nos filtros.</Typography>;
  return (
    <Stack spacing={0.75}>
      {linhas.map((l) => (
        <Box key={l.id || 'vazio'} sx={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 34%) 1fr auto', gap: 1, alignItems: 'center' }}>
          <Typography variant="body2" noWrap title={l.rotulo} color={l.id ? 'text.primary' : 'text.secondary'}>{l.rotulo}</Typography>
          <Box sx={{ height: 14, bgcolor: '#EEF2F6', borderRadius: 1, overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${(l.quantidade / max) * 100}%`, bgcolor: l.cor ?? 'secondary.main', borderRadius: 1 }} />
          </Box>
          <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right', minWidth: 120 }}>
            <b>{l.quantidade}</b>
            {comGanhos && <Box component="span" color="success.main"> · {l.ganhos} ganho{l.ganhos === 1 ? '' : 's'}</Box>}
            {!semValor && <Box component="span" color="text.secondary"> · {formatarMoedaCurta(l.valor)}</Box>}
          </Typography>
        </Box>
      ))}
    </Stack>
  );
}
