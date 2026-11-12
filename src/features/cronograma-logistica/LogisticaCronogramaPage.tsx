import AddRounded from '@mui/icons-material/AddRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import TableRowsRounded from '@mui/icons-material/TableRowsRounded';
import Alert from '@mui/material/Alert';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { listFuncionariosAtivos } from '../../services/funcionarios-selecao.service';
import { listObrasAtivas } from '../../services/obras.service';
import { listItensFrota } from '../../services/veiculos.service';
import { itemFrotaLabel, obraLabel, type ItemFrotaV2, type ObraV2, type PessoaV2 } from '../../utils/cadastrosV2';
import { CalendarioSemanas } from './components/CalendarioSemanas';
import { BarraColunas } from './components/Colunas';
import type { AbaPainel, AcoesLogistica, CadastrosLogistica } from './components/contexto';
import { PainelProgramacao } from './components/PainelProgramacao';
import { QuadroSemanas } from './components/QuadroSemanas';
import { usePrefsColunas } from './components/usePrefsColunas';
import {
  abrirSemana, atualizarProgramacao, converterCodigo, criarProgramacao, darCodigo, ignorarConflito, pessoasDoFriday, type PessoasFriday, excluirProgramacao, observarEtiquetas, observarObservacoes,
  observarProgramacoes, observarSemanas, salvarEtiquetas,
} from './data/logisticaFirestore';
import { semCodigoEmOrdem } from './domain/codigo';
import { ETIQUETAS_PADRAO, statusAoSalvarEtiquetas, type EtiquetaStatus } from './domain/status';
import { chaveConflito, conflitosAtivos, conflitosPorProgramacao } from './domain/conflitos';
import type { Observacao, Programacao, RefPessoa, Semana } from './domain/models';
import { hojeCivil, organizarSemanas, proximaSemanaParaAbrir, rotuloSemana, semanaIdDe } from './domain/semanas';
import './logistica.css';

/**
 * Cronograma Logístico (The Manuscript, 03_APLICACAO_WEB/15_LOGISTICA.md): quem sai, para qual obra, com qual
 * veículo e por qual motivo, semana a semana. Visual e uso do Friday; colunas fixas ligadas aos cadastros oficiais.
 */
type Aba = 'quadro' | 'calendario';

const mensagem = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function LogisticaCronogramaPage() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? '';
  const [aba, setAba] = useState<Aba>('quadro');
  const [semanas, setSemanas] = useState<Semana[] | null>(null);
  const [programacoes, setProgramacoes] = useState<Programacao[] | null>(null);
  const [observacoes, setObservacoes] = useState<Observacao[]>([]);
  const [etiquetas, setEtiquetas] = useState<EtiquetaStatus[]>([...ETIQUETAS_PADRAO]);
  const [cadastrosBrutos, setCadastrosBrutos] = useState<{ pessoas: PessoaV2[]; veiculos: ItemFrotaV2[]; obras: ObraV2[] } | null>(null);
  const [pessoasFriday, setPessoasFriday] = useState<PessoasFriday | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [abaPainel, setAbaPainel] = useState<AbaPainel>('programacao');
  const [abrindo, setAbrindo] = useState(false);
  const [prefsColunas, mudarPrefsColunas] = usePrefsColunas(uid);
  const tentouAbrirAtual = useRef<string | null>(null);
  const codigosPedidos = useRef(new Set<string>());
  // Criações da mesma aba, uma de cada vez: cada uma sobe o contador da semana.
  const filaCriacao = useRef<Promise<unknown>>(Promise.resolve());
  const hoje = hojeCivil();
  const atualId = semanaIdDe(hoje);

  useEffect(() => {
    const falha = (error: Error) => setErro(`Não foi possível ler o cronograma: ${error.message}`);
    const pararSemanas = observarSemanas(setSemanas, falha);
    const pararProgramacoes = observarProgramacoes(setProgramacoes, falha);
    const pararObservacoes = observarObservacoes(setObservacoes, (error) => setErro(`Não foi possível ler as observações: ${error.message}`));
    const pararEtiquetas = observarEtiquetas(setEtiquetas, (error) => setErro(`Não foi possível ler as etiquetas de status: ${error.message}`));
    return () => { pararSemanas(); pararProgramacoes(); pararObservacoes(); pararEtiquetas(); };
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all([listFuncionariosAtivos(), listItensFrota(), listObrasAtivas()])
      .then(([pessoas, veiculos, obras]) => { if (vivo) setCadastrosBrutos({ pessoas, veiculos, obras }); })
      .catch((error) => { if (vivo) setErro(`Não foi possível carregar motoristas, veículos e obras: ${mensagem(error)}`); });
    // Motorista e auxiliar vêm de dois quadros do Friday, pela Function (a logística não lê o Friday).
    pessoasDoFriday()
      .then((pessoas) => { if (vivo) setPessoasFriday(pessoas); })
      .catch((error) => { if (vivo) setErro(`Não foi possível carregar os funcionários e o banco de currículos do Friday: ${mensagem(error)}`); });
    return () => { vivo = false; };
  }, []);

  // Abertura automática: a semana atual nasce vazia quando alguém abre a página e ela ainda não existe.
  useEffect(() => {
    if (!semanas || !uid || semanas.some((semana) => semana.id === atualId) || tentouAbrirAtual.current === atualId) return;
    tentouAbrirAtual.current = atualId;
    abrirSemana(atualId, 'automatica', uid).catch((error) => setErro(`Não foi possível abrir a semana atual: ${mensagem(error)}`));
  }, [semanas, uid, atualId]);

  // Linhas de antes do código recebem um, na ordem da tela, uma de cada vez (o contador da semana é o mesmo); as do
  // código antigo (texto) passam ao número, com a mesma ordem. Nenhuma das duas assina a linha.
  useEffect(() => {
    if (!programacoes || !uid) return;
    const pendentes = semCodigoEmOrdem(programacoes).filter((programacao) => !codigosPedidos.current.has(programacao.id));
    const antigos = programacoes.filter((programacao) => programacao.codAntigo !== null && !codigosPedidos.current.has(programacao.id));
    if (!pendentes.length && !antigos.length) return;
    for (const programacao of [...pendentes, ...antigos]) codigosPedidos.current.add(programacao.id);
    (async () => {
      for (const programacao of antigos) await converterCodigo(programacao);
      for (const programacao of pendentes) await darCodigo(programacao.id);
    })().catch((error) => setErro(`Não foi possível gerar o código das linhas: ${mensagem(error)}`));
  }, [programacoes, uid]);

  const cadastros = useMemo<CadastrosLogistica>(() => {
    const pessoas = cadastrosBrutos?.pessoas ?? [];
    const veiculos = cadastrosBrutos?.veiculos ?? [];
    const obras = cadastrosBrutos?.obras ?? [];
    const motoristas = pessoasFriday?.motoristas ?? [];
    const auxiliares = pessoasFriday?.auxiliares ?? [];
    // Friday primeiro; funcionarios para as linhas de antes (UID) e os autores das observações.
    const nomePessoa = new Map<string, string>([
      ...pessoas.map((pessoa) => [pessoa.uid, pessoa.nome] as const),
      ...motoristas.map((pessoa) => [pessoa.id, pessoa.nome] as const),
      ...auxiliares.map((pessoa) => [pessoa.id, pessoa.nome] as const),
    ]);
    const nomeVeiculo = new Map(veiculos.map((veiculo) => [veiculo.id, itemFrotaLabel(veiculo)]));
    const nomeObra = new Map(obras.map((obra) => [obra.id, obraLabel(obra)]));
    return {
      motoristas: motoristas.map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome })),
      auxiliares: auxiliares.map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome, ...(pessoa.funcao ? { detalhe: pessoa.funcao } : {}) })),
      veiculos: veiculos.filter((veiculo) => veiculo.ativo).map((veiculo) => ({ id: veiculo.id, nome: itemFrotaLabel(veiculo) })),
      obras: obras.map((obra) => ({ id: obra.id, nome: obraLabel(obra) })),
      etiquetas,
      nomePessoa: (id, retrato) => nomePessoa.get(id) ?? retrato,
      nomeVeiculo: (id, retrato) => nomeVeiculo.get(id) ?? retrato,
      nomeObra: (id, retrato) => nomeObra.get(id) ?? retrato,
    };
  }, [cadastrosBrutos, pessoasFriday, etiquetas]);

  const lista = useMemo(() => programacoes ?? [], [programacoes]);
  const todosConflitos = useMemo(
    () => conflitosPorProgramacao(lista, (tipo, id, retrato) => (tipo === 'pessoa' ? cadastros.nomePessoa(id, retrato) : cadastros.nomeVeiculo(id, retrato))),
    [lista, cadastros],
  );
  const conflitos = useMemo(() => conflitosAtivos(todosConflitos), [todosConflitos]);
  const porSemana = useMemo(() => {
    const mapa = new Map<string, Programacao[]>();
    for (const programacao of lista) mapa.set(programacao.semanaId, [...(mapa.get(programacao.semanaId) ?? []), programacao]);
    for (const itens of mapa.values()) itens.sort((a, b) => a.posicao - b.posicao || a.id.localeCompare(b.id));
    return mapa;
  }, [lista]);

  // Observações por programação, da mais nova para a mais antiga (a que ainda não tem horário do servidor vem antes).
  const observacoesPor = useMemo(() => {
    const mapa = new Map<string, Observacao[]>();
    for (const observacao of observacoes) mapa.set(observacao.programacaoId, [...(mapa.get(observacao.programacaoId) ?? []), observacao]);
    for (const itens of mapa.values()) itens.sort((a, b) => (b.criadoEm ?? Infinity) - (a.criadoEm ?? Infinity));
    return mapa;
  }, [observacoes]);
  const nObservacoes = useMemo(() => new Map([...observacoesPor].map(([id, itens]) => [id, itens.length])), [observacoesPor]);

  const idsAbertos = useMemo(() => (semanas ?? []).map((semana) => semana.id), [semanas]);
  const grupos = organizarSemanas(idsAbertos, hoje);
  const proxima = proximaSemanaParaAbrir(idsAbertos, hoje);

  const falhar = useCallback((acao: string) => (error: unknown) => setErro(`Não foi possível ${acao}: ${mensagem(error)}`), []);
  // Quem grava assina com o UID e o nome do momento (colunas "Criado por" e "Modificado por").
  const nomeEu = cadastros.nomePessoa(uid, currentUser?.displayName || currentUser?.email || '');
  const eu = useMemo<RefPessoa>(() => ({ uid, nome: nomeEu }), [uid, nomeEu]);
  const acoes = useMemo<AcoesLogistica>(() => ({
    // A posição é o momento da criação: linhas criadas em sequência, antes do retorno do Firestore, não empatam.
    criar: (semanaId, item) => {
      const posicao = Date.now();
      filaCriacao.current = filaCriacao.current.then(() => criarProgramacao(semanaId, item, posicao, eu)).catch(falhar('criar a programação'));
    },
    atualizar: (id, alteracao) => { atualizarProgramacao(id, alteracao, eu).catch(falhar('salvar a alteração')); },
    excluir: (programacao) => {
      if (!window.confirm(`Excluir a programação "${programacao.item}"?`)) return;
      setAbertaId((aberta) => (aberta === programacao.id ? null : aberta));
      excluirProgramacao(programacao.id).catch(falhar('excluir a programação'));
    },
    abrir: (id, aba = 'programacao') => { setAbertaId(id); setAbaPainel(aba); },
    salvarEtiquetas: (novas) => {
      salvarEtiquetas(novas, statusAoSalvarEtiquetas(programacoes ?? [], etiquetas, novas), eu).catch(falhar('salvar as etiquetas'));
    },
    ignorarConflito: (programacao, conflito, ignorar) => {
      // Voltar a avisar tira a chave dos dois lados (qualquer um dos dois pode ter ignorado).
      const outra = (programacoes ?? []).find((item) => item.id === conflito.outraId);
      const chaveOutra = chaveConflito(conflito.chave.split('|')[0], programacao.id);
      const ladoOutro = !ignorar && outra?.conflitosIgnorados.includes(chaveOutra) ? { id: outra.id, chave: chaveOutra } : undefined;
      const ladoEste = ignorar || programacao.conflitosIgnorados.includes(conflito.chave);
      const promessa = ladoEste
        ? ignorarConflito(programacao, conflito.chave, ignorar, eu, ladoOutro)
        : ladoOutro ? ignorarConflito(outra!, chaveOutra, false, eu) : Promise.resolve();
      promessa.catch(falhar(ignorar ? 'ignorar o conflito' : 'voltar a avisar o conflito'));
    },
  }), [eu, falhar, programacoes, etiquetas]);

  const iniciarNovaSemana = () => {
    if (!proxima) return;
    setAbrindo(true);
    abrirSemana(proxima, 'manual', uid).catch(falhar('iniciar a nova semana')).finally(() => setAbrindo(false));
  };

  const carregando = semanas === null || programacoes === null;
  const aberta = abertaId ? lista.find((programacao) => programacao.id === abertaId) ?? null : null;

  return (
    <main className="lg-pagina">
      <header className="lg-cab">
        <nav className="lg-abas" aria-label="Visões">
          <button type="button" className={aba === 'quadro' ? 'on' : ''} onClick={() => setAba('quadro')}><TableRowsRounded fontSize="small" /> Quadro</button>
          <button type="button" className={aba === 'calendario' ? 'on' : ''} onClick={() => setAba('calendario')}><CalendarMonthRounded fontSize="small" /> Calendário</button>
        </nav>
      </header>

      {erro && <Alert severity="error" onClose={() => setErro(null)} className="lg-erro">{erro}</Alert>}

      {carregando ? (
        <p className="lg-vazio">Carregando o cronograma…</p>
      ) : aba === 'quadro' ? (
        <>
          <div className="lg-barra">
            <button
              type="button"
              className="lg-btn lg-btn-primario"
              onClick={iniciarNovaSemana}
              disabled={!proxima || abrindo || !uid}
              title={proxima ? `Abre a ${rotuloSemana(proxima)}` : 'Já dá para programar até duas semanas à frente da atual'}
            >
              <AddRounded fontSize="small" /> Iniciar nova semana
            </button>
            {(!cadastrosBrutos || !pessoasFriday) && <span className="lg-muted">Carregando motoristas, veículos e obras…</span>}
            <span className="lg-espaco" />
            <BarraColunas prefs={prefsColunas} mudar={mudarPrefsColunas} />
          </div>
          <QuadroSemanas
            futuras={grupos.futuras}
            atual={grupos.atual}
            anteriores={grupos.anteriores}
            porSemana={porSemana}
            cadastros={cadastros}
            conflitos={conflitos}
            todosConflitos={todosConflitos}
            acoes={acoes}
            nObservacoes={nObservacoes}
            prefs={prefsColunas}
            mudarPrefs={mudarPrefsColunas}
          />
        </>
      ) : (
        <CalendarioSemanas programacoes={lista} hoje={hoje} cadastros={cadastros} conflitos={conflitos} acoes={acoes} />
      )}

      <PainelProgramacao
        programacao={aberta}
        aba={abaPainel}
        onAba={setAbaPainel}
        observacoes={aberta ? observacoesPor.get(aberta.id) ?? [] : []}
        eu={eu}
        cadastros={cadastros}
        todosConflitos={todosConflitos}
        acoes={acoes}
        onFechar={() => setAbertaId(null)}
      />
    </main>
  );
}
