import AddRounded from '@mui/icons-material/AddRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import TableRowsRounded from '@mui/icons-material/TableRowsRounded';
import Alert from '@mui/material/Alert';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { listFuncionariosAtivos } from '../../services/funcionarios-selecao.service';
import { listObrasAtivas } from '../../services/obras.service';
import { listItensFrota } from '../../services/veiculos.service';
import { itemFrotaLabel, obraLabel, temPerfil, type ItemFrotaV2, type ObraV2, type PessoaV2 } from '../../utils/cadastrosV2';
import { CalendarioSemanas } from './components/CalendarioSemanas';
import type { AcoesLogistica, CadastrosLogistica } from './components/contexto';
import { PainelProgramacao } from './components/PainelProgramacao';
import { QuadroSemanas } from './components/QuadroSemanas';
import {
  abrirSemana, atualizarProgramacao, criarProgramacao, excluirProgramacao, observarProgramacoes, observarSemanas,
} from './data/logisticaFirestore';
import { conflitosPorProgramacao } from './domain/conflitos';
import type { Programacao, Semana } from './domain/models';
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
  const [cadastrosBrutos, setCadastrosBrutos] = useState<{ pessoas: PessoaV2[]; veiculos: ItemFrotaV2[]; obras: ObraV2[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const tentouAbrirAtual = useRef<string | null>(null);
  const hoje = hojeCivil();
  const atualId = semanaIdDe(hoje);

  useEffect(() => {
    const falha = (error: Error) => setErro(`Não foi possível ler o cronograma: ${error.message}`);
    const pararSemanas = observarSemanas(setSemanas, falha);
    const pararProgramacoes = observarProgramacoes(setProgramacoes, falha);
    return () => { pararSemanas(); pararProgramacoes(); };
  }, []);

  useEffect(() => {
    let vivo = true;
    Promise.all([listFuncionariosAtivos(), listItensFrota(), listObrasAtivas()])
      .then(([pessoas, veiculos, obras]) => { if (vivo) setCadastrosBrutos({ pessoas, veiculos, obras }); })
      .catch((error) => { if (vivo) setErro(`Não foi possível carregar motoristas, veículos e obras: ${mensagem(error)}`); });
    return () => { vivo = false; };
  }, []);

  // Abertura automática: a semana atual nasce vazia quando alguém abre a página e ela ainda não existe.
  useEffect(() => {
    if (!semanas || !uid || semanas.some((semana) => semana.id === atualId) || tentouAbrirAtual.current === atualId) return;
    tentouAbrirAtual.current = atualId;
    abrirSemana(atualId, 'automatica', uid).catch((error) => setErro(`Não foi possível abrir a semana atual: ${mensagem(error)}`));
  }, [semanas, uid, atualId]);

  const cadastros = useMemo<CadastrosLogistica>(() => {
    const pessoas = cadastrosBrutos?.pessoas ?? [];
    const veiculos = cadastrosBrutos?.veiculos ?? [];
    const obras = cadastrosBrutos?.obras ?? [];
    const nomePessoa = new Map(pessoas.map((pessoa) => [pessoa.uid, pessoa.nome]));
    const nomeVeiculo = new Map(veiculos.map((veiculo) => [veiculo.id, itemFrotaLabel(veiculo)]));
    const nomeObra = new Map(obras.map((obra) => [obra.id, obraLabel(obra)]));
    return {
      motoristas: pessoas.filter((pessoa) => temPerfil(pessoa, 'motorista')).map((pessoa) => ({ id: pessoa.uid, nome: pessoa.nome })),
      pessoas: pessoas.map((pessoa) => ({ id: pessoa.uid, nome: pessoa.nome })),
      veiculos: veiculos.filter((veiculo) => veiculo.ativo).map((veiculo) => ({ id: veiculo.id, nome: itemFrotaLabel(veiculo) })),
      obras: obras.map((obra) => ({ id: obra.id, nome: obraLabel(obra) })),
      nomePessoa: (id, retrato) => nomePessoa.get(id) ?? retrato,
      nomeVeiculo: (id, retrato) => nomeVeiculo.get(id) ?? retrato,
      nomeObra: (id, retrato) => nomeObra.get(id) ?? retrato,
    };
  }, [cadastrosBrutos]);

  const lista = useMemo(() => programacoes ?? [], [programacoes]);
  const conflitos = useMemo(
    () => conflitosPorProgramacao(lista, (tipo, id, retrato) => (tipo === 'pessoa' ? cadastros.nomePessoa(id, retrato) : cadastros.nomeVeiculo(id, retrato))),
    [lista, cadastros],
  );
  const porSemana = useMemo(() => {
    const mapa = new Map<string, Programacao[]>();
    for (const programacao of lista) mapa.set(programacao.semanaId, [...(mapa.get(programacao.semanaId) ?? []), programacao]);
    for (const itens of mapa.values()) itens.sort((a, b) => a.posicao - b.posicao || a.id.localeCompare(b.id));
    return mapa;
  }, [lista]);

  const idsAbertos = useMemo(() => (semanas ?? []).map((semana) => semana.id), [semanas]);
  const grupos = organizarSemanas(idsAbertos, hoje);
  const proxima = proximaSemanaParaAbrir(idsAbertos, hoje);

  const falhar = useCallback((acao: string) => (error: unknown) => setErro(`Não foi possível ${acao}: ${mensagem(error)}`), []);
  const acoes = useMemo<AcoesLogistica>(() => ({
    // A posição é o momento da criação: linhas criadas em sequência, antes do retorno do Firestore, não empatam.
    criar: (semanaId, item) => { criarProgramacao(semanaId, item, Date.now(), uid).catch(falhar('criar a programação')); },
    atualizar: (id, alteracao) => { atualizarProgramacao(id, alteracao, uid).catch(falhar('salvar a alteração')); },
    excluir: (programacao) => {
      if (!window.confirm(`Excluir a programação "${programacao.item}"?`)) return;
      setAbertaId((aberta) => (aberta === programacao.id ? null : aberta));
      excluirProgramacao(programacao.id).catch(falhar('excluir a programação'));
    },
    abrir: setAbertaId,
  }), [uid, falhar]);

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
            {!cadastrosBrutos && <span className="lg-muted">Carregando motoristas, veículos e obras…</span>}
          </div>
          <QuadroSemanas
            futuras={grupos.futuras}
            atual={grupos.atual}
            anteriores={grupos.anteriores}
            porSemana={porSemana}
            cadastros={cadastros}
            conflitos={conflitos}
            acoes={acoes}
          />
        </>
      ) : (
        <CalendarioSemanas programacoes={lista} hoje={hoje} cadastros={cadastros} conflitos={conflitos} acoes={acoes} />
      )}

      <PainelProgramacao programacao={aberta} cadastros={cadastros} conflitos={conflitos} acoes={acoes} onFechar={() => setAbertaId(null)} />
    </main>
  );
}
