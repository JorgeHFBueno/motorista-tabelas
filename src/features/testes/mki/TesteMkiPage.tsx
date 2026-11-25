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
import { ehPdfDeGrupo, maisRecente, parteDoPdf, SEM_PEDIDO, type PdfPreFabricado, type PreFabricado } from '../../obras/preFabricados';
import { useAuth } from '../../../contexts/AuthContext';
import './mki.css';

/**
 * /testes/mki: mock do detalhe da obra (/engenharia/obras/:id) com os LOTEs em lista (ListaLotes, a mesma da página
 * real). Aqui os pré-fabricados imitam o Plannix (peças com códigos e etapas) e os PDFs são anexados, substituídos e
 * excluídos: obra, LOTEs e pré-fabricados fictícios em memória; nada vai para o Firestore nem para o Storage.
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

/** Peças fictícias: `n` códigos a partir de `inicio`, cada um na etapa da lista (repetida até o fim). */
const pecas = (inicio: number, n: number, etapas: string[]) =>
  Array.from({ length: n }, (_, i) => ({ codigo: String(inicio + i), etapa: etapas[i % etapas.length], data: `2026-11-${String(10 + (i % 14)).padStart(2, '0')}T09:30:00-03:00` }));
const item = (id: string, grupo: string, tipo: string, lista: ReturnType<typeof pecas>, extra: Partial<PreFabricado> = {}): PreFabricado =>
  ({ id, grupo, tipo, quantidade: lista.length, pecas: lista, desenhos: [], pdfs: [], ...extra });

const LOTES_INICIAIS: LoteComPreFabricados[] = [
  {
    chave: 'l1', nome: 'LOTE 1 - LINHA SÃO JOSÉ - (6,00X10,00M) - PONTE', status: 'Em execução', coordenada: { lat: -29.3359, lng: -53.0532 },
    origem: 'Pedido 951 · Plannix 301 · PM ARROIO DO TIGRE · PONTE 6,00X10,00M',
    itens: [
      item('f1', 'PILAR', 'P01', pecas(1376222, 10, ['CORTE DOBRA', 'CORTE DOBRA', 'CORTE DOBRA', 'ACABADA', 'ACABADA', 'ACABADA', 'ACABADA', 'EXPEDIDA', 'EXPEDIDA', 'EXPEDIDA']), {
        desenhos: ['P01-pilar-rev1.pdf'],
        pdfs: [
          pdf('p1', 'LF_LOTE1_P01_rev0.pdf', 412, '2026-10-21T14:12:00-03:00', 'Mariana Kern'),
          pdf('p2', 'LF_LOTE1_P01_rev1.pdf', 436, '2026-10-28T09:47:00-03:00', 'Mariana Kern'),
          { ...pdf('p1c', 'LF_LOTE1_P01Console.pdf', 288, '2026-10-28T10:02:00-03:00', 'Mariana Kern'), parte: 'console' },
        ],
      }),
      item('f2', 'PILAR', 'P02', pecas(1376240, 2, ['EXPEDIDA']), { pdfs: [pdf('p3', 'LF_LOTE1_P02.pdf', 398, '2026-10-29T11:05:00-03:00', 'Mariana Kern')] }),
      item('f3', 'VIGA', 'VL - 25X70X1000', pecas(1376300, 4, ['CONCRETAGEM', 'ARMAÇÃO']), { pdfs: [pdf('p4', 'LF_LOTE1_VL.pdf', 1210, '2026-11-12T16:30:00-03:00', 'Rafael Dornelles')] }),
    ],
  },
  {
    chave: 'l2', nome: 'LOTE 2 - SÍTIO ALTO - BUEIRO CELULAR 2,00X2,00M', status: 'Em execução', coordenada: { lat: -29.3051, lng: -53.0917 },
    origem: 'Pedido 952 · Plannix 302 · PM ARROIO DO TIGRE · GALERIA 2,00X2,00M',
    itens: [item('f4', 'GALERIA', 'GAL 2,00X2,00', pecas(1376400, 8, ['PROJETADA', 'PROGRAMADA']), { pdfs: [pdf('p5', 'LF_LOTE2_galeria.pdf', 845, '2026-11-04T08:20:00-03:00', 'Rafael Dornelles')] })],
  },
  {
    chave: 'l3', nome: 'LOTE 3 - CORREDEIRA - (7,60X12,00M) - PONTE', status: 'Revisar escopo', coordenada: { lat: -29.3712, lng: -53.0204 },
    origem: 'Pedido 953 · Plannix 303 · PM ARROIO DO TIGRE · PONTE 7,60X12,00M (sem projeto: Lançamento Final)',
    itens: [
      { id: 'f6', grupo: 'VIGA', tipo: 'RETANGULAR · 25X70 · 12 m', quantidade: 4, pecas: [], desenhos: [], pdfs: [] },
      { id: 'f7', grupo: 'VIGOTA', tipo: 'TRELICADA · TR16 - 20CM · 1,35 m', quantidade: 24, pecas: [], desenhos: [], pdfs: [] },
    ],
  },
  { chave: 'l4', nome: 'LOTE 4 - ACESSO CENTRO - PAVIMENTAÇÃO', status: '', coordenada: null, itens: null, aviso: SEM_PEDIDO },
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
    anexar({ lote, item, parte }, modo, arquivo) {
      const url = URL.createObjectURL(arquivo);
      urls.current.push(url);
      const novo: PdfPreFabricado = { id: `${Date.now()}`, nome: arquivo.name, tamanho: arquivo.size, anexadoEm: new Date(), anexadoPor: usuario, url, ...(parte === 'console' ? { parte } : {}) };
      const comNovo = (pdfs: PdfPreFabricado[]) => {
        const recente = maisRecente(pdfs.filter((pdf) => parteDoPdf(pdf) === parte));
        return modo === 'substituir' && recente ? pdfs.map((existente) => (existente.id === recente.id ? novo : existente)) : [...pdfs, novo];
      };
      // Grupo com PDF único (Vigotes e Guarda Roda): `item` é a chave do grupo.
      if (ehPdfDeGrupo(item)) {
        setLotes((atuais) => atuais.map((atual) => (atual.chave !== lote ? atual : {
          ...atual,
          pdfsDosGrupos: { ...atual.pdfsDosGrupos, [item]: comNovo(atual.pdfsDosGrupos?.[item] ?? []) },
        })));
      } else {
        alterarItem(lote, item, (atual) => ({ ...atual, pdfs: comNovo(atual.pdfs) }));
      }
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
        pdfsDosGrupos: Object.fromEntries(Object.entries(lote.pdfsDosGrupos ?? {}).map(([chave, pdfs]) => [chave, pdfs.filter((pdfItem) => pdfItem.id !== item.id)])),
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
            O cadastro da obra é feito no Friday (quadro GESTÃO DE OBRAS); aqui se editam só o local, o sinônimo e os PDFs dos pré-fabricados.
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
