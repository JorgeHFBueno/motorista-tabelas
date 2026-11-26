import { useState } from 'react';
import { Alert, Box, Chip, Container, Paper, Snackbar, Stack, Tab, Tabs, Typography } from '@mui/material';
import ScienceRounded from '@mui/icons-material/ScienceRounded';
import { CatalogoMkii, ModelosMkii } from './BibliotecaMkii';
import { PacotesMkii, ServicosDaObraMkii, type ObraMkii } from './ObraMkii';
import { tirarItemDosModelos, tirarModelo, type ItemCatalogo, type Pacote, type ServicoDaObra, type ServicoModelo } from './composicoes';
import './mkii.css';

/**
 * /testes/mkii (pedido do responsável, 2026-11-26): o serviço como modelo para várias obras, no formato da composição dos
 * orçamentos de obra (SINAPI, TCPO; "assembly" no RSMeans). Biblioteca da Ledur: cadastros e serviços-modelo com os
 * coeficientes por unidade. Obras: o modelo aplicado com quantidade e LOTE, e os pacotes com o mestre. Duas obras
 * fictícias usam os mesmos modelos. Dados fictícios em memória: nada vai para o Firestore. Regras em composicoes.ts.
 */

const catalogo = (categoria: ItemCatalogo['categoria'], lista: [string, string, string][]): ItemCatalogo[] =>
  lista.map(([id, descricao, grupo]) => ({ id, categoria, descricao, grupo }));
const CATALOGO: ItemCatalogo[] = [
  ...catalogo('insumos', [['i1', 'Cimento CP-II 50 kg', 'Cimento'], ['i2', 'Areia média', 'Agregados'], ['i3', 'Brita 1', 'Agregados'], ['i4', 'Aço CA-50 Ø10', 'Aço'], ['i5', 'Graute 60 MPa', 'Cimento'], ['i6', 'Desmoldante', 'Químicos'], ['i7', 'Aparelho de apoio em neoprene', 'Apoios']]),
  ...catalogo('concreto', [['c1', 'Concreto fck 30 MPa bombeado', 'Estrutural'], ['c2', 'Concreto fck 25 MPa', 'Fundação']]),
  ...catalogo('ferramentas', [['f1', 'Vibrador de imersão', 'Concretagem'], ['f2', 'Kit de escoramento metálico', 'Escoramento'], ['f3', 'Nível a laser', 'Topografia']]),
  ...catalogo('maquinas', [['m1', 'Guindaste 50 t', 'Içamento'], ['m2', 'Caminhão Munck', 'Içamento'], ['m3', 'Escavadeira 320', 'Terraplenagem'], ['m4', 'Bate-estaca', 'Fundação']]),
  ...catalogo('tarefas', [['t1', 'Sapata Isolada', 'Fundação'], ['t2', 'Estacas', 'Fundação'], ['t3', 'Montagem Longarinas', 'Super Estrutura'], ['t4', 'Montagem Guarda Corpo', 'Super Estrutura'], ['t5', 'Pilares Centrais', 'Mesoestruturas']]),
];

/** Coeficientes fictícios, só para mostrar a conta (não são de tabela nenhuma). */
const MODELOS: ServicoModelo[] = [
  {
    id: 'sm1', nome: 'Concretagem de sapata isolada', unidade: 'm³', descricao: 'Forma, armação e concreto da sapata, com vibração.',
    itens: [{ item: 't1', coeficiente: 1, unidade: 'm³' }, { item: 'c2', coeficiente: 1.05, unidade: 'm³' }, { item: 'i4', coeficiente: 80, unidade: 'kg' }, { item: 'i6', coeficiente: 0.3, unidade: 'L' }, { item: 'f1', coeficiente: 0.5, unidade: 'h' }],
  },
  {
    id: 'sm2', nome: 'Montagem de longarina', unidade: 'peça', descricao: 'Içar a longarina, posicionar nos aparelhos de apoio e grautear os nichos.',
    itens: [{ item: 't3', coeficiente: 1, unidade: 'peça' }, { item: 'm1', coeficiente: 0.25, unidade: 'diária' }, { item: 'm2', coeficiente: 0.25, unidade: 'diária' }, { item: 'i7', coeficiente: 2, unidade: 'un' }, { item: 'i5', coeficiente: 0.02, unidade: 'm³' }],
  },
  {
    id: 'sm3', nome: 'Cravação de estacas', unidade: 'm', descricao: 'Estaca pré-moldada cravada com bate-estaca.',
    itens: [{ item: 't2', coeficiente: 1, unidade: 'm' }, { item: 'm4', coeficiente: 0.05, unidade: 'diária' }, { item: 'f3', coeficiente: 0.02, unidade: 'diária' }],
  },
  {
    id: 'sm4', nome: 'Montagem de guarda-corpo', unidade: 'm', descricao: 'Fixar os módulos de guarda-corpo e grautear.',
    itens: [{ item: 't4', coeficiente: 1, unidade: 'm' }, { item: 'm2', coeficiente: 0.02, unidade: 'diária' }, { item: 'i5', coeficiente: 0.002, unidade: 'm³' }],
  },
];

const OBRAS: ObraMkii[] = [
  {
    id: 'o1', nome: 'ARROIO DO TIGRE 112/2026',
    lotes: [{ chave: 'l1', nome: 'LOTE 1' }, { chave: 'l5', nome: 'LOTE 5' }],
    preFabricados: [
      { id: 'pf1', lote: 'l1', tipo: 'VL - 25X70X1000', quantidade: 4, expedidas: 2 },
      { id: 'pf2', lote: 'l1', tipo: 'P01', quantidade: 10, expedidas: 3 },
      { id: 'pf3', lote: 'l5', tipo: 'VL - 25X50X1500', quantidade: 7, expedidas: 5 },
      { id: 'pf4', lote: 'l5', tipo: 'GC - 2,00M', quantidade: 8, expedidas: 0 },
    ],
    alocacoes: [{ id: 'a1', mestre: 'Paulo Schneider', lote: 'l1' }, { id: 'a3', mestre: 'Darci Wolf', lote: 'l5' }],
  },
  {
    id: 'o2', nome: 'SOBRADINHO 98/2026',
    lotes: [{ chave: 'l1', nome: 'LOTE 1' }, { chave: 'l2', nome: 'LOTE 2' }],
    preFabricados: [
      { id: 'pf5', lote: 'l1', tipo: 'VL - 30X80X1200', quantidade: 6, expedidas: 6 },
      { id: 'pf6', lote: 'l2', tipo: 'GC - 2,00M', quantidade: 12, expedidas: 4 },
    ],
    alocacoes: [{ id: 'a2', mestre: 'Ivo Hammes', lote: 'l1' }, { id: 'a4', mestre: 'Leandro Mallmann', lote: 'l2' }],
  },
];

const SERVICOS: ServicoDaObra[] = [
  { id: 'so1', obra: 'o1', modelo: 'sm2', quantidade: 4, lote: 'l1', pecas: [{ preFabricado: 'pf1', quantidade: 4 }], observacao: '' },
  { id: 'so2', obra: 'o1', modelo: 'sm1', quantidade: 6, lote: 'l1', pecas: [], observacao: 'Sapatas do encontro A' },
  { id: 'so3', obra: 'o2', modelo: 'sm2', quantidade: 6, lote: 'l1', pecas: [{ preFabricado: 'pf5', quantidade: 6 }], observacao: '' },
  { id: 'so4', obra: 'o2', modelo: 'sm4', quantidade: 24, lote: 'l2', pecas: [{ preFabricado: 'pf6', quantidade: 12 }], observacao: '' },
];
const PACOTES: Pacote[] = [
  { id: 'pk1', obra: 'o1', nome: 'Longarinas do LOTE 1', servicos: ['so1'], alocacao: 'a1' },
  { id: 'pk2', obra: 'o2', nome: 'Superestrutura do LOTE 1', servicos: ['so3'], alocacao: 'a2' },
];

type Aba = 'biblioteca' | 'obras';
const SUBITENS: Record<Aba, { valor: string; rotulo: string }[]> = {
  biblioteca: [{ valor: 'modelos', rotulo: 'Serviços-modelo' }, { valor: 'cadastros', rotulo: 'Cadastros' }],
  obras: [{ valor: 'servicos', rotulo: 'Serviços da obra' }, { valor: 'pacotes', rotulo: 'Pacotes' }],
};

export default function TesteMkiiPage() {
  const [itens, setItens] = useState(CATALOGO);
  const [modelos, setModelos] = useState(MODELOS);
  const [servicos, setServicos] = useState(SERVICOS);
  const [pacotes, setPacotes] = useState(PACOTES);
  const [aba, setAba] = useState<Aba>('biblioteca');
  const [subitem, setSubitem] = useState('modelos');
  const [obraId, setObraId] = useState(OBRAS[0].id);
  const [aviso, setAviso] = useState<string | null>(null);
  const obra = OBRAS.find((o) => o.id === obraId) ?? OBRAS[0];
  const nomeDaObra = (id: string) => OBRAS.find((o) => o.id === id)?.nome ?? id;

  const salvarItem = (item: ItemCatalogo) => {
    setItens((atuais) => (atuais.some((i) => i.id === item.id) ? atuais.map((i) => (i.id === item.id ? item : i)) : [...atuais, item]));
    setAviso(`${item.descricao} salvo na Biblioteca.`);
  };
  const excluirItem = (item: ItemCatalogo) => {
    setItens((atuais) => atuais.filter((i) => i.id !== item.id));
    setModelos((atuais) => tirarItemDosModelos(item.id, atuais));
    setAviso(`${item.descricao} excluído (saiu também dos modelos).`);
  };
  const excluirModelo = (modelo: ServicoModelo) => {
    const sem = tirarModelo(modelo.id, servicos, pacotes);
    setModelos((atuais) => atuais.filter((m) => m.id !== modelo.id));
    setServicos(sem.servicos);
    setPacotes(sem.pacotes);
    setAviso(`${modelo.nome} excluído (saiu também das obras que o usavam).`);
  };
  /** Serviço tirado da obra sai dos pacotes. */
  const mudarServicos = (proximos: ServicoDaObra[]) => {
    setServicos(proximos);
    setPacotes((atuais) => atuais.map((p) => ({ ...p, servicos: p.servicos.filter((id) => proximos.some((s) => s.id === id)) })));
  };

  return (
    <>
      <div className="teste-aviso" role="note">
        <ScienceRounded fontSize="small" />
        <strong>Teste de interface · MKII</strong>
        <span>Serviços como modelo para várias obras (composições). Dados e coeficientes fictícios em memória: nada é salvo, e recarregar a página volta ao início.</span>
      </div>

      <Container sx={{ py: 4 }}>
        <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography sx={{ fontSize: { xs: 24, sm: 30 }, fontWeight: 700 }}>Serviços e pacotes</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            A Biblioteca da Ledur guarda os serviços-modelo, que valem para todas as obras. Na obra, o modelo é aplicado com uma quantidade, e os itens saem calculados.
          </Typography>

          <Box sx={{ mt: 3, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
            <Tabs value={aba} onChange={(_e, valor: Aba) => { setAba(valor); setSubitem(SUBITENS[valor][0].valor); }} variant="scrollable" scrollButtons="auto" aria-label="Partes do teste">
              <Tab value="biblioteca" label="Biblioteca da Ledur" />
              <Tab value="obras" label="Obras" />
            </Tabs>
            <Tabs
              value={subitem}
              onChange={(_e, valor: string) => setSubitem(valor)}
              variant="scrollable"
              scrollButtons="auto"
              aria-label="Subitens"
              sx={{ minHeight: 36, pl: { xs: 1, sm: 3 }, borderTop: 1, borderColor: 'divider', bgcolor: 'action.hover', '& .MuiTab-root': { minHeight: 36, py: 0.5, fontSize: 13 } }}
            >
              {SUBITENS[aba].map((s) => <Tab key={s.valor} value={s.valor} label={s.rotulo} />)}
            </Tabs>
          </Box>

          <Box sx={{ mt: 2.5 }}>
            {aba === 'biblioteca' && subitem === 'modelos' && <ModelosMkii itens={itens} modelos={modelos} servicos={servicos} nomeDaObra={nomeDaObra} onMudar={setModelos} onExcluir={excluirModelo} />}
            {aba === 'biblioteca' && subitem === 'cadastros' && <CatalogoMkii itens={itens} modelos={modelos} onSalvar={salvarItem} onExcluir={excluirItem} />}
            {aba === 'obras' && (
              <>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                  {OBRAS.map((o) => <Chip key={o.id} label={o.nome} color={o.id === obraId ? 'primary' : 'default'} variant={o.id === obraId ? 'filled' : 'outlined'} onClick={() => setObraId(o.id)} />)}
                </Stack>
                {subitem === 'servicos' && <ServicosDaObraMkii key={obra.id} obra={obra} itens={itens} modelos={modelos} servicos={servicos} onMudar={mudarServicos} />}
                {subitem === 'pacotes' && <PacotesMkii key={obra.id} obra={obra} itens={itens} modelos={modelos} servicos={servicos} pacotes={pacotes} onMudar={setPacotes} />}
              </>
            )}
          </Box>
        </Paper>
      </Container>

      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert onClose={() => setAviso(null)} severity="info" variant="filled">{aviso}</Alert>
      </Snackbar>
    </>
  );
}
