import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import CampoEditavel from '../../obras/CampoEditavelObra';
import ListaLotes, { type AcoesPdf, type LoteComPreFabricados } from '../../obras/ListaLotes';
import { maisRecente, type PdfPreFabricado, type PreFabricado } from '../../obras/preFabricados';
import { useAuth } from '../../../contexts/AuthContext';
import './mki.css';

/**
 * /testes/mki: mock do detalhe da obra (/engenharia/obras/:id) com os LOTEs em lista (ListaLotes, a mesma da página
 * real). Aqui os pré-fabricados já vêm preenchidos e os PDFs são anexados, substituídos e excluídos: obra, LOTEs e
 * pré-fabricados fictícios em memória; nada vai para o Firestore nem para o Storage.
 */

const pdf = (id: string, nome: string, kb: number, quando: string, por: string): PdfPreFabricado =>
  ({ id, nome, tamanho: kb * 1024, anexadoEm: new Date(quando), anexadoPor: por, url: null });

const OBRA = {
  nomeObra: 'ARROIO DO TIGRE 112/2026',
  situacao: 'Solicitar ART',
  local: 'Arroio do Tigre - RS',
  siglaObra: '',
  contrato: '112/2026',
  empresa: 'LEDUR',
  tipoObra: 'Pública',
  status: 'CONTRATADA',
  dataInicial: '03/08/2026',
  dataFinal: '30/01/2027',
  ordemInicio: '10/08/2026',
  confirmacaoRecurso: 'Confirmado',
  subcentroErp: '241',
  codObra: '1187',
  ano: '2026',
};

const LOTES_INICIAIS: LoteComPreFabricados[] = [
  {
    chave: 'l1', nome: 'LOTE 1 - LINHA SÃO JOSÉ - (6,00X10,00M) - PONTE', status: 'Concluído', coordenada: { lat: -29.3359, lng: -53.0532 },
    itens: [
      { id: 'f1', tipo: 'Pilar 1', status: 'Concluído', pdfs: [
        pdf('p1', 'LF_LOTE1_pilar1_rev0.pdf', 412, '2026-10-21T14:12:00-03:00', 'Mariana Kern'),
        pdf('p2', 'LF_LOTE1_pilar1_rev1.pdf', 436, '2026-10-28T09:47:00-03:00', 'Mariana Kern'),
      ] },
      { id: 'f2', tipo: 'Pilar 2', status: 'Concluído', pdfs: [pdf('p3', 'LF_LOTE1_pilar2.pdf', 398, '2026-10-29T11:05:00-03:00', 'Mariana Kern')] },
      { id: 'f7', tipo: 'Pilar 3', status: 'Em análise', pdfs: [pdf('p6', 'LF_LOTE1_pilar3.pdf', 405, '2026-11-17T10:02:00-03:00', 'Mariana Kern')] },
      { id: 'f3', tipo: 'Vão 1', status: 'Em análise', pdfs: [pdf('p4', 'LF_LOTE1_vao1.pdf', 1210, '2026-11-12T16:30:00-03:00', 'Rafael Dornelles')] },
    ],
  },
  {
    chave: 'l2', nome: 'LOTE 2 - SÍTIO ALTO - BUEIRO CELULAR 2,00X2,00M', status: 'Em execução', coordenada: { lat: -29.3051, lng: -53.0917 },
    itens: [
      { id: 'f4', tipo: 'Cabeceira 1', status: 'Revisar', pdfs: [pdf('p5', 'LF_LOTE2_cabeceira1.pdf', 845, '2026-11-04T08:20:00-03:00', 'Rafael Dornelles')] },
      { id: 'f5', tipo: 'Cabeceira 2', status: 'Pendente', pdfs: [] },
    ],
  },
  {
    chave: 'l3', nome: 'LOTE 3 - CORREDEIRA - (7,60X12,00M) - PONTE', status: 'Revisar escopo', coordenada: { lat: -29.3712, lng: -53.0204 },
    itens: [{ id: 'f6', tipo: 'Pilar 1', status: 'Pendente', pdfs: [] }],
  },
  { chave: 'l4', nome: 'LOTE 4 - ACESSO CENTRO - PAVIMENTAÇÃO', status: '', coordenada: null, itens: [] },
];

function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <Box minWidth={0}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{valor || '—'}</Typography>
    </Box>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
      <Typography variant="h6" sx={{ mb: 1.5 }}>{titulo}</Typography>
      {children}
    </Paper>
  );
}

function Tabela({ cabecalho, linhas, direita = [] }: { cabecalho: string[]; linhas: ReactNode[][]; direita?: number[] }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>{cabecalho.map((titulo, index) => <TableCell key={titulo} align={direita.includes(index) ? 'right' : 'left'} sx={{ fontWeight: 700 }}>{titulo}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {linhas.map((linha, row) => (
            <TableRow key={row}>{linha.map((celula, index) => <TableCell key={index} align={direita.includes(index) ? 'right' : 'left'}>{celula}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function TesteMkiPage() {
  const { authorizationProfile, currentUser } = useAuth();
  const usuario = authorizationProfile?.nome || currentUser?.displayName || currentUser?.email || 'Você';
  const [local, setLocal] = useState(OBRA.local);
  const [sigla, setSigla] = useState(OBRA.siglaObra);
  const [lotes, setLotes] = useState(LOTES_INICIAIS);
  const [aviso, setAviso] = useState<string | null>(null);
  const urls = useRef<string[]>([]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const alterarItem = (lote: string, item: string, alterar: (atual: PreFabricado) => PreFabricado) =>
    setLotes((atuais) => atuais.map((atual) => (atual.chave !== lote ? atual : {
      ...atual,
      itens: (atual.itens ?? []).map((existente) => (existente.id === item ? alterar(existente) : existente)),
    })));

  /** Anexar (sem PDF) e Revisão acrescentam uma revisão; Substituir troca o PDF atual, sem nova revisão. */
  const acoesPdf: AcoesPdf = {
    anexar({ lote, item }, modo, arquivo) {
      const url = URL.createObjectURL(arquivo);
      urls.current.push(url);
      const novo: PdfPreFabricado = { id: `${Date.now()}`, nome: arquivo.name, tamanho: arquivo.size, anexadoEm: new Date(), anexadoPor: usuario, url };
      alterarItem(lote, item, (atual) => {
        const recente = maisRecente(atual.pdfs);
        if (modo === 'substituir' && recente) return { ...atual, pdfs: atual.pdfs.map((existente) => (existente.id === recente.id ? novo : existente)) };
        return { ...atual, pdfs: [...atual.pdfs, novo] };
      });
      setAviso(modo === 'substituir' ? `PDF substituído por ${arquivo.name}.` : modo === 'revisao' ? `${arquivo.name} anexado como nova revisão.` : `${arquivo.name} anexado.`);
    },
    abrir(item) {
      if (item.url) window.open(item.url, '_blank', 'noopener');
      else setAviso('PDF fictício do teste: não há arquivo para abrir.');
    },
    excluir(item) {
      setLotes((atuais) => atuais.map((lote) => ({
        ...lote,
        itens: (lote.itens ?? []).map((existente) => ({ ...existente, pdfs: existente.pdfs.filter((pdfItem) => pdfItem.id !== item.id) })),
      })));
      setAviso(`${item.nome} excluído.`);
    },
  };

  const salvar = (set: (valor: string) => void) => async (valor: string) => { set(valor.trim()); return true; };

  return (
    <>
      <div className="teste-aviso" role="note">
        <ScienceRounded fontSize="small" />
        <strong>Teste de interface · MKI</strong>
        <span>Detalhe da obra com os LOTEs e os pré-fabricados em lista. Dados fictícios em memória: nada é salvo, e recarregar a página volta ao início.</span>
      </div>

      <Container sx={{ py: 4 }}>
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="contained" onClick={() => setAviso('No teste o relatório não é gerado.')}>Gerar Relatório</Button>
        </Stack>

        <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: 700 }}>{OBRA.nomeObra}</Typography>
            <Chip label={OBRA.situacao} size="small" variant="outlined" />
          </Stack>

          <Stack spacing={2} sx={{ mt: 2 }}>
            <CampoEditavel campo="local" valor={local} vazio={local ? null : { texto: 'Local a corrigir', botao: 'Cadastrar local' }} destaque salvando={false} onSalvar={salvar(setLocal)} />
            <CampoEditavel campo="siglaObra" valor={sigla} vazio={sigla ? null : { texto: 'Sem sinônimo', botao: 'Cadastrar sinônimo' }} salvando={false} onSalvar={salvar(setSigla)} />
          </Stack>

          <Box sx={{ mt: 2.5, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
            <Campo rotulo="Contrato" valor={OBRA.contrato} />
            <Campo rotulo="Empresa" valor={OBRA.empresa} />
            <Campo rotulo="Tipo de obra" valor={OBRA.tipoObra} />
            <Campo rotulo="Status no sistema" valor={OBRA.status} />
            <Campo rotulo="Início do contrato" valor={OBRA.dataInicial} />
            <Campo rotulo="Fim do contrato" valor={OBRA.dataFinal} />
            <Campo rotulo="Ordem de início" valor={OBRA.ordemInicio} />
            <Campo rotulo="Confirmação de recurso" valor={OBRA.confirmacaoRecurso} />
            <Campo rotulo="Subcentro ERP" valor={OBRA.subcentroErp} />
            <Campo rotulo="Código" valor={OBRA.codObra} />
            <Campo rotulo="Ano" valor={OBRA.ano} />
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5, mb: 1 }}>LOTEs</Typography>
          <ListaLotes lotes={lotes} acoesPdf={acoesPdf} />

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            O cadastro da obra é feito no Friday (quadro GESTÃO DE OBRAS); aqui só o local e o sinônimo podem ser editados.
          </Typography>
        </Paper>

        <Secao titulo="Saldo do contrato / medições">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
            <Campo rotulo="Medições" valor="R$ 418.230,55" />
            <Campo rotulo="Notas de medição" valor="3" />
            <Campo rotulo="Total do contrato" valor="Não informado" />
            <Campo rotulo="Saldo do contrato" valor="Não informado" />
          </Box>
        </Secao>

        <Secao titulo="Mestres alocados">
          <Tabela
            cabecalho={['Mestre', 'LOTE', 'Início', 'Fim', 'Dias']}
            direita={[4]}
            linhas={[
              ['Paulo Schneider', 'LOTE 1 - LINHA SÃO JOSÉ', '10/08/2026', '25/10/2026', '55 dias'],
              ['Ivo Hammes', 'LOTE 2 - SÍTIO ALTO', '26/10/2026', '18/12/2026', '38 dias'],
            ]}
          />
        </Secao>

        <Secao titulo="Veículos que foram para a obra">
          <Tabela
            cabecalho={['Veículo', 'Atividades', 'Primeira', 'Última', 'Motoristas']}
            direita={[1]}
            linhas={[
              ['IZX4H21 — Caminhão Munck', 14, '11/08/2026', '12/11/2026', 'Jair Lopes, Vilmar Port'],
              ['JBC7E09 — Escavadeira 320', 9, '18/08/2026', '30/10/2026', 'Jair Lopes'],
            ]}
          />
        </Secao>

        <Secao titulo="Combustível">
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            <Campo rotulo="Abastecimentos" valor="12" />
            <Campo rotulo="Litros" valor="2.140,0 L" />
            <Campo rotulo="Valor" valor="R$ 13.268,00" />
          </Box>
        </Secao>
      </Container>

      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setAviso(null)} severity="info" variant="filled">{aviso}</Alert>
      </Snackbar>
    </>
  );
}
