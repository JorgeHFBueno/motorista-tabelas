import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Container,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import CampoEditavel from '../../obras/CampoEditavelObra';
import ListaLotes, { type AcoesPdf, type AcoesSincronizar, type LoteComPreFabricados } from '../../obras/ListaLotes';
import type { SincronizacaoPlannix, StatusSincronizacao } from '../../obras/sincronizacaoPlannix';
import { ehPdfDeGrupo, maisRecente, parteDoPdf, SEM_PEDIDO, type PdfPreFabricado, type PreFabricado } from '../../obras/preFabricados';
import { useAuth } from '../../../contexts/AuthContext';
import { AgendarPacote, CalendarioMestres, ListaMestres } from './MestresMki';
import { atividadePorId, dataCurta, marcarPeca, type Alocacao, type Pacote } from './pacotesTrabalho';
import './mki.css';

/**
 * /testes/mki: mock do detalhe da obra (/engenharia/obras/:id) com os LOTEs em lista (ListaLotes, a mesma da página
 * real). Aqui os pré-fabricados imitam o Plannix (peças com códigos e etapas) e os PDFs são anexados, substituídos e
 * excluídos: obra, LOTEs e pré-fabricados fictícios em memória; nada vai para o Firestore nem para o Storage.
 * Sincronizar: um robô de mentira anda a fila sozinho (simula em segundos, mostra a prévia e, aprovada, "grava").
 * Layout igual ao da página real (2026-11-25: Detalhes recolhível e abas LOTEs | Mestres | Logística | Em breve). Mestres
 * (2026-11-26): os Pacotes de Trabalho (MestresMki.tsx), que agendam a montagem das peças por atividade, mestre e período.
 */
const PREVIA_FICTICIA = [
  'Obra 141 (PM ALEGRIA) · etapa GERAL',
  'P01  volume 0,9375 m³  comprimento 7,50 m  classe 30MPa',
  '     aço: 1 CA-50 Ø10 2×745 cm · 2 CA-60 Ø5 53×180 cm · total 112,66 kg (tela: 112,66 kg)',
  'P02  já registrada no Plannix: fica como está',
  'Nada foi gravado: aprove para o robô registrar.',
].join('\n');

const pdf = (id: string, nome: string, kb: number, quando: string, por: string): PdfPreFabricado =>
  ({ id, nome, tamanho: kb * 1024, anexadoEm: new Date(quando), anexadoPor: por, url: null });

const OBRA = {
  nomeObra: 'ARROIO DO TIGRE 112/2026',
  situacao: 'Obra em Andamento',
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

/** "Hoje" do teste: o dia de quem abre, em Brasília. */
const HOJE = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const dias = (n: number) => new Date(Date.parse(`${HOJE}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const MESTRES = ['Paulo Schneider', 'Ivo Hammes', 'Darci Wolf', 'Leandro Mallmann'];
/** Alocações fictícias no CronoObra, em torno de hoje. */
const ALOCACOES: Alocacao[] = [
  { mestre: 'Paulo Schneider', lote: 'l1', inicio: dias(-20), fim: dias(40) },
  { mestre: 'Ivo Hammes', lote: 'l2', inicio: dias(-35), fim: dias(14) },
  { mestre: 'Darci Wolf', lote: 'l5', inicio: dias(5), fim: dias(60) },
];
const PACOTES_INICIAIS: Pacote[] = [
  { id: 'pk1', atividade: 'longarinas', mestre: 'Paulo Schneider', inicio: dias(5), fim: dias(7), pecas: [{ lote: 'l1', codigo: '1376300', tipo: 'VL - 25X70X1000' }, { lote: 'l1', codigo: '1376302', tipo: 'VL - 25X70X1000' }] },
];

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
      item('f3', 'VIGA', 'VL - 25X70X1000', pecas(1376300, 4, ['EXPEDIDA', 'ACABADA', 'EXPEDIDA', 'CONCRETAGEM']), { pdfs: [pdf('p4', 'LF_LOTE1_VL.pdf', 1210, '2026-11-12T16:30:00-03:00', 'Rafael Dornelles')] }),
      item('f8', 'VIGA', 'VT - 20X60X560', pecas(1376320, 3, ['ACABADA', 'FORMA', 'ARMAÇÃO'])),
      item('f9', 'VIGA', 'VM - 40X80X650', pecas(1376330, 2, ['EXPEDIDA', 'MONTADA'])),
      item('f10', 'CORTINA', 'CT - 300X120', pecas(1376340, 4, ['ACABADA', 'CONCRETAGEM', 'CORTE DOBRA', ''])),
      item('f12', 'GUARDA RODA', 'GR - 1,00M', pecas(1376360, 10, ['EXPEDIDA', 'ACABADA', 'PROGRAMADA'])),
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
  {
    chave: 'l5', nome: 'LOTE 5 - LAJEADO FUNDO - (5,00X15,00M) - PONTE', status: 'Próxima a Iniciar', coordenada: { lat: -29.3901, lng: -53.0711 },
    origem: 'Pedido 955 · Plannix 305 · PM ARROIO DO TIGRE · PONTE 5,00X15,00M',
    itens: [
      item('f13', 'VIGA', 'VL - 25X50X1500', pecas(1376500, 7, ['EXPEDIDA', 'EXPEDIDA', 'EXPEDIDA', 'EXPEDIDA', 'ACABADA', 'ACABADA', 'MONTADA'])),
      item('f14', 'PILAR', 'P01', pecas(1376520, 4, ['CONCRETAGEM', 'ARMAÇÃO', 'PROJETADA', ''])),
      item('f15', 'GUARDA CORPO', 'GC - 2,00M', pecas(1376530, 8, ['PROGRAMADA', 'PROJETADA'])),
    ],
  },
];

const SUBITENS = {
  lotes: [{ valor: 'todos', rotulo: 'Todos' }],
  mestres: [{ valor: 'lista', rotulo: 'Lista' }, { valor: 'calendarios', rotulo: 'Calendários' }, { valor: 'atividades', rotulo: 'Atividades' }],
  logistica: [{ valor: 'todos', rotulo: 'Todos' }, { valor: 'deslocamentos', rotulo: 'Deslocamentos' }, { valor: 'combustivel', rotulo: 'Combustível' }],
};

function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <Box minWidth={0}>
      <Typography variant="body2" color="text.secondary">{rotulo}</Typography>
      <Typography sx={{ fontSize: 16, fontWeight: 600, overflowWrap: 'anywhere' }}>{valor || '—'}</Typography>
    </Box>
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
  const [pacotes, setPacotes] = useState(PACOTES_INICIAIS);
  const [detalhes, setDetalhes] = useState(false);
  // Abas como na página real: nenhuma aberta ao entrar; a aba abre no primeiro subitem.
  const [aba, setAba] = useState<'lotes' | 'mestres' | 'logistica' | false>(false);
  const [subitem, setSubitem] = useState('todos');
  const [aviso, setAviso] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const relogios = useRef<number[]>([]);

  useEffect(() => () => {
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    relogios.current.forEach((relogio) => window.clearTimeout(relogio));
  }, []);

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

  /** O robô de mentira: muda o status do LOTE e, se ainda estiver no esperado, segue o próximo passo depois de um tempo. */
  const mudarSincronizacao = (lote: string, status: StatusSincronizacao, extra: Partial<SincronizacaoPlannix> = {}, se?: StatusSincronizacao) =>
    setLotes((atuais) => atuais.map((atual) => {
      if (atual.chave !== lote || (se && atual.sincronizacao?.status !== se)) return atual;
      const anterior = atual.sincronizacao;
      return { ...atual, sincronizacao: { id: lote, lote, pedidoPor: usuario, pedidoEm: new Date(), aprovadoPor: '', previa: '', mensagem: '', ...anterior, ...extra, status, atualizadoEm: new Date() } };
    }));
  const depois = (ms: number, passo: () => void) => { relogios.current.push(window.setTimeout(passo, ms)); };
  const sincronizar: AcoesSincronizar = {
    podeEditar: true,
    pedir(lote) {
      mudarSincronizacao(lote, 'pedido', { pedidoPor: usuario, pedidoEm: new Date(), aprovadoPor: '', previa: '', mensagem: '' });
      depois(1500, () => mudarSincronizacao(lote, 'simulando', {}, 'pedido'));
      depois(4000, () => mudarSincronizacao(lote, 'previa', { previa: PREVIA_FICTICIA }, 'simulando'));
      setAviso('Sincronização pedida: o robô simula e mostra a prévia aqui.');
    },
    aprovar(s) {
      mudarSincronizacao(s.lote, 'aprovado', { aprovadoPor: usuario });
      depois(1500, () => mudarSincronizacao(s.lote, 'gravando', {}, 'aprovado'));
      depois(4000, () => mudarSincronizacao(s.lote, 'concluido', { mensagem: 'P01 registrada no Plannix.' }, 'gravando'));
      setAviso('Prévia aprovada: o robô grava no Plannix.');
    },
    cancelar(s) {
      mudarSincronizacao(s.lote, 'cancelado');
      setAviso('Sincronização cancelada.');
    },
  };

  const agendarPacote = (pacote: Pacote) => {
    setPacotes((atuais) => [...atuais, pacote]);
    const oQue = pacote.pecas.length
      ? `${pacote.pecas.length} ${pacote.pecas.length === 1 ? 'peça agendada' : 'peças agendadas'}`
      : `serviço agendado em ${pacote.lotes?.length ?? 0} ${pacote.lotes?.length === 1 ? 'LOTE' : 'LOTEs'}`;
    setAviso(`${atividadePorId(pacote.atividade)?.nome}: ${oQue} com ${pacote.mestre}, ${dataCurta(pacote.inicio)} a ${dataCurta(pacote.fim)}.`);
  };
  const marcarPecaDoPacote = (pacoteId: string, chave: string, para: 'montada' | 'agendada' | 'expedida') => {
    setPacotes((atuais) => marcarPeca(atuais, pacoteId, chave, para));
    setAviso(para === 'montada' ? 'Peça marcada como Montada.' : para === 'agendada' ? 'Peça de volta a Agendada.' : 'Peça de volta a Expedida: saiu do pacote.');
  };
  const concluirServico = (pacote: Pacote, concluido: boolean) =>
    setPacotes((atuais) => atuais.map((p) => (p.id === pacote.id ? { ...p, concluido } : p)));
  const excluirPacote = (pacote: Pacote) => {
    setPacotes((atuais) => atuais.filter((p) => p.id !== pacote.id));
    setAviso('Pacote excluído: as peças voltaram a ficar livres.');
  };

  const salvar = (set: (valor: string) => void) => async (valor: string) => { set(valor.trim()); return true; };

  return (
    <>
      <div className="teste-aviso" role="note">
        <ScienceRounded fontSize="small" />
        <strong>Teste de interface · MKI</strong>
        <span>Detalhe da obra com as abas LOTEs, Mestres (Pacotes de Trabalho) e Logística. Dados fictícios em memória: nada é salvo, e recarregar a página volta ao início.</span>
      </div>

      <Container sx={{ py: 4 }}>
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="contained" onClick={() => setAviso('No teste o relatório não é gerado.')}>Gerar Relatório</Button>
        </Stack>

        <Paper variant="outlined" sx={{ mt: 3, p: { xs: 2, sm: 3 } }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 4 }} alignItems={{ md: 'center' }}>
            <Typography sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: 700 }}>{OBRA.nomeObra}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 4 }} sx={{ flex: 1, minWidth: 0 }}>
              <CampoEditavel campo="local" valor={local} vazio={local ? null : { texto: 'Local a corrigir', botao: 'Cadastrar local' }} salvando={false} onSalvar={salvar(setLocal)} />
              <CampoEditavel campo="siglaObra" valor={sigla} vazio={sigla ? null : { texto: 'Sem sinônimo', botao: 'Cadastrar sinônimo' }} salvando={false} onSalvar={salvar(setSigla)} />
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
            <Button size="small" variant="outlined" onClick={() => setDetalhes((aberto) => !aberto)} startIcon={detalhes ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />} aria-expanded={detalhes}>
              Detalhes
            </Button>
            <Chip label={OBRA.situacao} size="small" variant="outlined" />
          </Stack>

          <Collapse in={detalhes}>
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
          </Collapse>

          <Box sx={{ mt: 3, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Tabs value={aba} onChange={(_event, valor: 'lotes' | 'mestres' | 'logistica') => { setAba(valor); setSubitem(SUBITENS[valor][0].valor); }} variant="scrollable" scrollButtons="auto" aria-label="Partes da obra">
              <Tab value="lotes" label="LOTEs" />
              <Tab value="mestres" label="Mestres" />
              <Tab value="logistica" label="Logística" />
              <Tab label="Em breve" disabled />
            </Tabs>
            {aba && (
              <Tabs
                value={subitem}
                onChange={(_event, valor: string) => setSubitem(valor)}
                variant="scrollable"
                scrollButtons="auto"
                aria-label="Subitens"
                sx={{ minHeight: 36, pl: { xs: 1, sm: 3 }, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover', '& .MuiTab-root': { minHeight: 36, py: 0.5, fontSize: 13 } }}
              >
                {(aba === 'lotes' ? [{ valor: 'todos', rotulo: 'Todos' }, ...lotes.map((lote) => ({ valor: lote.chave, rotulo: lote.nome.split(' - ')[0] }))] : SUBITENS[aba]).map((item) => (
                  <Tab key={item.valor} value={item.valor} label={item.rotulo} />
                ))}
                {aba !== 'lotes' && <Tab label="Em breve" disabled />}
              </Tabs>
            )}
          </Box>

          {aba && (
            <Box sx={{ mt: 2.5 }}>
              {aba === 'lotes' && <ListaLotes lotes={lotes.filter((lote) => subitem === 'todos' || lote.chave === subitem)} acoesPdf={acoesPdf} sincronizar={sincronizar} />}
              {aba === 'mestres' && subitem === 'lista' && <ListaMestres lotes={lotes} alocacoes={ALOCACOES} pacotes={pacotes} onExcluir={excluirPacote} onMarcarPeca={marcarPecaDoPacote} onConcluir={concluirServico} />}
              {aba === 'mestres' && subitem === 'calendarios' && <CalendarioMestres lotes={lotes} mestres={MESTRES} alocacoes={ALOCACOES} pacotes={pacotes} hoje={HOJE} />}
              {aba === 'mestres' && subitem === 'atividades' && <AgendarPacote lotes={lotes} pacotes={pacotes} alocacoes={ALOCACOES} mestres={MESTRES} hoje={HOJE} onAgendar={agendarPacote} />}
              {aba === 'logistica' && subitem !== 'combustivel' && (
                <Box sx={{ mb: 3 }}>
                  {subitem === 'todos' && <Typography variant="h6" sx={{ mb: 1.5 }}>Deslocamentos</Typography>}
                  <Tabela
                    cabecalho={['Veículo', 'Atividades', 'Primeira', 'Última', 'Motoristas']}
                    direita={[1]}
                    linhas={[
                      ['IZX4H21 — Caminhão Munck', 14, '11/08/2026', '12/11/2026', 'Jair Lopes, Vilmar Port'],
                      ['JBC7E09 — Escavadeira 320', 9, '18/08/2026', '30/10/2026', 'Jair Lopes'],
                    ]}
                  />
                </Box>
              )}
              {aba === 'logistica' && subitem !== 'deslocamentos' && (
                <Box>
                  {subitem === 'todos' && <Typography variant="h6" sx={{ mb: 1.5 }}>Combustível</Typography>}
                  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
                    <Campo rotulo="Abastecimentos" valor="12" />
                    <Campo rotulo="Litros" valor="2.140,0 L" />
                    <Campo rotulo="Valor" valor="R$ 13.268,00" />
                  </Box>
                </Box>
              )}
            </Box>
          )}

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            O cadastro da obra é feito no Friday (quadro GESTÃO DE OBRAS); aqui se editam só o local, o sinônimo e os PDFs dos pré-fabricados.
          </Typography>
        </Paper>
      </Container>

      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setAviso(null)} severity="info" variant="filled">{aviso}</Alert>
      </Snackbar>
    </>
  );
}
