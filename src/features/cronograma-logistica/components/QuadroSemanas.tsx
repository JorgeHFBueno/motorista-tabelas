import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { textoCodigo } from '../domain/codigo';
import { colunasVisiveis, fixacao, ordenarPor, type ChaveColuna, type ColunaVisivel, type PrefsColunas, type ValorOrdem } from '../domain/colunas';
import { paresDeConflito, periodoDe } from '../domain/conflitos';
import { MAX_VEICULOS, type Programacao, type RefPessoa } from '../domain/models';
import { posicaoAoSoltar } from '../domain/ordem';
import { rotuloSemana } from '../domain/semanas';
import { CampoEscolha, CampoEscolhaVarios, CampoPeriodo, CampoStatus, CampoTexto } from './campos';
import { CabecalhoColuna, type MudarPrefs } from './Colunas';
import { BotaoConflitos } from './Conflitos';
import {
  opcaoObra, opcaoPessoa, opcoesVeiculos, refCadastro, refPessoa, refsCadastro,
  type AcoesLogistica, type CadastrosLogistica, type ConflitosLogistica,
} from './contexto';

export type TipoSemana = 'futura' | 'atual' | 'anterior';

const COR: Record<TipoSemana, string> = { futura: '#2e9d6f', atual: '#2f6fde', anterior: '#9699a6' };
const LARGURA_ACAO = 40;

interface Comum {
  cadastros: CadastrosLogistica;
  /** Os que avisam. */
  conflitos: ConflitosLogistica;
  /** Todos, inclusive os ignorados (para a lista com "Voltar a avisar"). */
  todosConflitos: ConflitosLogistica;
  acoes: AcoesLogistica;
  /** Quantas observações cada programação tem. */
  nObservacoes: ReadonlyMap<string, number>;
}

interface Tabela {
  colunas: ColunaVisivel[];
  prefs: PrefsColunas;
  mudarPrefs: MudarPrefs;
  onLarguraAoVivo: (largura: { chave: ChaveColuna; valor: number } | null) => void;
}

/** Arrastar pela alça reordena dentro da semana; o alvo é a linha antes da qual a arrastada entra (null = no fim). */
interface Arraste {
  /** Com a tabela ordenada por uma coluna não se arrasta (a ordem da tela não é a da semana). */
  ligado: boolean;
  arrastando: string | null;
  alvo: string | null | undefined;
  onIniciar: (id: string) => void;
  onAlvo: (antesDe: string | null) => void;
  onSoltar: (antesDe: string | null) => void;
  onTerminar: () => void;
}

const nomeAutor = (ref: RefPessoa | null, cadastros: CadastrosLogistica) => (ref ? cadastros.nomePessoa(ref.uid, ref.nome) || ref.nome : '');
const quando = (ms: number | null) => (ms === null ? '' : new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }));

/** Valor de cada coluna para ordenar (o que a célula mostra; status pela ordem das etiquetas). */
function valorParaOrdenar(chave: ChaveColuna, programacao: Programacao, cadastros: CadastrosLogistica): ValorOrdem {
  switch (chave) {
    case 'cod': return programacao.cod;
    case 'item': return programacao.item;
    case 'periodo': return periodoDe(programacao)?.inicio ?? null;
    case 'motorista': return programacao.motorista ? cadastros.nomePessoa(programacao.motorista.id, programacao.motorista.nome) : null;
    case 'auxiliar': return programacao.auxiliar ? cadastros.nomePessoa(programacao.auxiliar.id, programacao.auxiliar.nome) : null;
    case 'veiculos': return programacao.veiculos.map((veiculo) => cadastros.nomeVeiculo(veiculo.id, veiculo.nome)).join(', ');
    case 'obra': return programacao.obra ? cadastros.nomeObra(programacao.obra.id, programacao.obra.nome) : null;
    case 'status': {
      const indice = cadastros.etiquetas.findIndex((etiqueta) => etiqueta.id === programacao.status);
      return indice >= 0 ? indice : null;
    }
    case 'expedicao': return programacao.expedicao;
    case 'criadoPor': return nomeAutor(programacao.criadoPor, cadastros);
    case 'modificadoPor': return nomeAutor(programacao.modificadoPor, cadastros);
    default: return null;
  }
}

function LinhaProgramacao({ programacao, cadastros, conflitos, todosConflitos, acoes, nObservacoes, arraste, colunas }: Comum & {
  programacao: Programacao;
  arraste: Arraste;
  colunas: ColunaVisivel[];
}) {
  const lista = conflitos.get(programacao.id) ?? [];
  const nObs = nObservacoes.get(programacao.id) ?? 0;
  const classes = [
    lista.length ? 'is-conflito' : '',
    arraste.arrastando === programacao.id ? 'is-arrastando' : '',
    arraste.arrastando && arraste.alvo === programacao.id ? 'is-alvo' : '',
  ].filter(Boolean).join(' ');
  const atualizar = acoes.atualizar.bind(null, programacao.id);

  const celula = (chave: ChaveColuna): ReactNode => {
    switch (chave) {
      case 'cod':
        return <span className="lg-cod" title={programacao.cod === null ? 'Gerando o código…' : undefined}>{programacao.cod === null ? '…' : textoCodigo(programacao.cod)}</span>;
      case 'item':
        return (
          <span className="lg-item">
            {arraste.ligado && (
              <span
                className="lg-alca"
                draggable
                title="Arrastar para mudar a ordem"
                aria-label="Arrastar para mudar a ordem"
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', programacao.id); arraste.onIniciar(programacao.id); }}
                onDragEnd={arraste.onTerminar}
              >
                <DragIndicatorRounded fontSize="small" />
              </span>
            )}
            {lista.length > 0 && (
              <BotaoConflitos
                className="lg-aviso"
                titulo="Ver os conflitos desta programação"
                rotulo={<WarningAmberRounded fontSize="small" />}
                itens={(todosConflitos.get(programacao.id) ?? []).map((conflito) => ({ programacao, conflito }))}
                acoes={acoes}
                mostrarLinha={false}
              />
            )}
            <CampoTexto valor={programacao.item} obrigatorio maximo={200} onSalvar={(item) => atualizar({ item })} />
            <button type="button" className="lg-abrir" onClick={() => acoes.abrir(programacao.id)} title="Abrir">
              <OpenInFullRounded fontSize="inherit" />
            </button>
            <button
              type="button"
              className={`lg-balao${nObs ? ' tem' : ''}`}
              onClick={() => acoes.abrir(programacao.id, 'observacoes')}
              title={nObs ? `${nObs} ${nObs === 1 ? 'observação' : 'observações'}` : 'Adicionar observação'}
              aria-label={nObs ? `Observações (${nObs})` : 'Adicionar observação'}
            >
              <ChatBubbleOutlineRounded fontSize="inherit" />
              {nObs > 0 && <span>{nObs}</span>}
            </button>
          </span>
        );
      case 'periodo':
        return <CampoPeriodo inicio={programacao.inicio} fim={programacao.fim} onSalvar={(periodo) => atualizar(periodo)} />;
      case 'motorista':
        return <CampoEscolha rotulo="Motorista" valor={opcaoPessoa(programacao.motorista, cadastros)} opcoes={cadastros.motoristas} onSalvar={(opcao) => atualizar({ motorista: refPessoa(opcao) })} />;
      case 'auxiliar':
        return <CampoEscolha rotulo="Auxiliar" valor={opcaoPessoa(programacao.auxiliar, cadastros)} opcoes={cadastros.auxiliares} onSalvar={(opcao) => atualizar({ auxiliar: refPessoa(opcao) })} />;
      case 'veiculos':
        return <CampoEscolhaVarios rotulo="Veículos" maximo={MAX_VEICULOS} valores={opcoesVeiculos(programacao.veiculos, cadastros)} opcoes={cadastros.veiculos} onSalvar={(opcoes) => atualizar({ veiculos: refsCadastro(opcoes) })} />;
      case 'obra':
        return <CampoEscolha rotulo="Obra" valor={opcaoObra(programacao.obra, cadastros)} opcoes={cadastros.obras} onSalvar={(opcao) => atualizar({ obra: refCadastro(opcao) })} />;
      case 'status':
        return <CampoStatus valor={programacao.status} etiquetas={cadastros.etiquetas} onSalvar={(status) => atualizar({ status })} onSalvarEtiquetas={acoes.salvarEtiquetas} />;
      case 'expedicao':
        return <CampoTexto valor={programacao.expedicao} maximo={200} onSalvar={(expedicao) => atualizar({ expedicao })} />;
      case 'nota':
      case 'adiamento':
        return <span className="lg-em-breve">Vem Novidade Aí</span>;
      case 'criadoPor':
      case 'modificadoPor': {
        const ref = chave === 'criadoPor' ? programacao.criadoPor : programacao.modificadoPor;
        const em = chave === 'criadoPor' ? programacao.criadoEm : programacao.modificadoEm;
        const nome = nomeAutor(ref, cadastros);
        return <span className="lg-autor" title={[nome, quando(em)].filter(Boolean).join(' · ')}>{nome || '—'}</span>;
      }
    }
  };

  return (
    <tr
      className={classes}
      onDragOver={(event) => { if (arraste.arrastando) { event.preventDefault(); arraste.onAlvo(programacao.id); } }}
      onDrop={(event) => { event.preventDefault(); arraste.onSoltar(programacao.id); }}
    >
      {colunas.map((coluna) => {
        const { className, style } = fixacao(coluna);
        return <td key={coluna.chave} className={`lg-col-${coluna.chave} ${className}`} style={style}>{celula(coluna.chave)}</td>;
      })}
      <td className="lg-col-acao">
        <button type="button" className="lg-btn-icone" onClick={() => acoes.excluir(programacao)} title="Excluir" aria-label={`Excluir ${programacao.item}`}>
          <DeleteOutlineRounded fontSize="small" />
        </button>
      </td>
    </tr>
  );
}

function NovaProgramacao({ onCriar, arraste, colunas }: { onCriar: (item: string) => void; arraste: Arraste; colunas: number }) {
  const [texto, setTexto] = useState('');
  const criar = () => {
    const item = texto.trim();
    if (!item) return;
    onCriar(item);
    setTexto('');
  };
  return (
    <tr
      className={`lg-nova${arraste.arrastando && arraste.alvo === null ? ' is-alvo' : ''}`}
      onDragOver={(event) => { if (arraste.arrastando) { event.preventDefault(); arraste.onAlvo(null); } }}
      onDrop={(event) => { event.preventDefault(); arraste.onSoltar(null); }}
    >
      <td colSpan={colunas + 1}>
        <input
          className="lg-input lg-input-nova"
          value={texto}
          maxLength={200}
          placeholder="+ Adicionar programação"
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') criar(); if (event.key === 'Escape') setTexto(''); }}
          onBlur={criar}
        />
      </td>
    </tr>
  );
}

export function GrupoSemana({ semanaId, tipo, programacoes, aberto, onAlternar, tabela, ...comum }: Comum & {
  semanaId: string;
  tipo: TipoSemana;
  programacoes: Programacao[];
  aberto: boolean;
  onAlternar: () => void;
  tabela: Tabela;
}) {
  const { colunas, prefs } = tabela;
  const nConflitos = programacoes.filter((programacao) => comum.conflitos.has(programacao.id)).length;
  const pares = paresDeConflito(programacoes, (id) => comum.todosConflitos.get(id) ?? []);
  const nIgnorados = pares.filter((par) => par.conflito.ignorado).length;
  const ordem = prefs.ordem;
  const linhas = useMemo(
    () => (ordem ? ordenarPor(programacoes, (programacao) => valorParaOrdenar(ordem.chave, programacao, comum.cadastros), ordem.dir) : programacoes),
    [programacoes, ordem, comum.cadastros],
  );
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null | undefined>(undefined);
  const terminar = () => { setArrastando(null); setAlvo(undefined); };
  const arraste: Arraste = {
    ligado: !ordem,
    arrastando,
    alvo,
    onIniciar: setArrastando,
    onAlvo: setAlvo,
    onSoltar: (antesDe) => {
      const id = arrastando;
      terminar();
      if (!id) return;
      const posicao = posicaoAoSoltar(programacoes, id, antesDe);
      if (posicao !== null) comum.acoes.atualizar(id, { posicao });
    },
    onTerminar: terminar,
  };
  return (
    <section className="lg-grupo" style={{ '--lg-cor-grupo': COR[tipo] } as CSSProperties}>
      <div className="lg-grupo-topo">
        <button type="button" className="lg-grupo-cab" onClick={onAlternar} aria-expanded={aberto}>
          {aberto ? <ExpandMoreRounded /> : <ChevronRightRounded />}
          <span className="lg-grupo-nome">{rotuloSemana(semanaId)}{tipo === 'atual' ? ' (atual)' : ''}</span>
          <span className="lg-grupo-total">{programacoes.length} {programacoes.length === 1 ? 'programação' : 'programações'}</span>
        </button>
        {nConflitos > 0 && (
          <BotaoConflitos
            className="lg-grupo-conflitos"
            titulo="Ver os conflitos da semana"
            rotulo={<><WarningAmberRounded fontSize="inherit" /> {nConflitos} com conflito</>}
            itens={pares}
            acoes={comum.acoes}
          />
        )}
        {nConflitos === 0 && nIgnorados > 0 && (
          <BotaoConflitos
            className="lg-grupo-conflitos is-ignorados"
            titulo="Ver os conflitos ignorados da semana"
            rotulo={`${nIgnorados} ${nIgnorados === 1 ? 'conflito ignorado' : 'conflitos ignorados'}`}
            itens={pares}
            acoes={comum.acoes}
          />
        )}
      </div>
      {aberto && (
        <div className="lg-tabela-rolagem">
          <table className="lg-tabela">
            <colgroup>
              {colunas.map((coluna) => <col key={coluna.chave} style={{ width: coluna.largura }} />)}
              <col style={{ width: LARGURA_ACAO }} />
            </colgroup>
            <thead>
              <tr>
                {colunas.map((coluna) => (
                  <CabecalhoColuna key={coluna.chave} coluna={coluna} prefs={prefs} mudar={tabela.mudarPrefs} onLarguraAoVivo={tabela.onLarguraAoVivo} />
                ))}
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((programacao) => <LinhaProgramacao key={programacao.id} programacao={programacao} arraste={arraste} colunas={colunas} {...comum} />)}
              <NovaProgramacao onCriar={(item) => comum.acoes.criar(semanaId, item)} arraste={arraste} colunas={colunas.length} />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function QuadroSemanas({ futuras, atual, anteriores, porSemana, prefs, mudarPrefs, ...comum }: Comum & {
  futuras: string[];
  atual: string | null;
  anteriores: string[];
  porSemana: ReadonlyMap<string, Programacao[]>;
  prefs: PrefsColunas;
  mudarPrefs: MudarPrefs;
}) {
  // Futuras e a atual começam abertas; as anteriores, recolhidas (dentro do grupo também recolhido).
  const [alternadas, setAlternadas] = useState<ReadonlySet<string>>(new Set());
  const [anterioresAbertas, setAnterioresAbertas] = useState(false);
  // Largura enquanto a borda é arrastada: todas as semanas acompanham; grava ao soltar.
  const [larguraAoVivo, setLarguraAoVivo] = useState<{ chave: ChaveColuna; valor: number } | null>(null);
  const colunas = useMemo(
    () => colunasVisiveis(larguraAoVivo ? { ...prefs, larguras: { ...prefs.larguras, [larguraAoVivo.chave]: larguraAoVivo.valor } } : prefs),
    [prefs, larguraAoVivo],
  );
  const tabela: Tabela = { colunas, prefs, mudarPrefs, onLarguraAoVivo: setLarguraAoVivo };
  const alternar = (id: string) => setAlternadas((atuais) => {
    const novas = new Set(atuais);
    if (novas.has(id)) novas.delete(id); else novas.add(id);
    return novas;
  });
  const grupo = (id: string, tipo: TipoSemana) => (
    <GrupoSemana
      key={id}
      semanaId={id}
      tipo={tipo}
      programacoes={porSemana.get(id) ?? []}
      aberto={tipo === 'anterior' ? alternadas.has(id) : !alternadas.has(id)}
      onAlternar={() => alternar(id)}
      tabela={tabela}
      {...comum}
    />
  );
  return (
    <div className="lg-quadro">
      {futuras.map((id) => grupo(id, 'futura'))}
      {atual && grupo(atual, 'atual')}
      {anteriores.length > 0 && (
        <section className="lg-anteriores">
          <button type="button" className="lg-anteriores-cab" onClick={() => setAnterioresAbertas((aberto) => !aberto)} aria-expanded={anterioresAbertas}>
            {anterioresAbertas ? <ExpandMoreRounded /> : <ChevronRightRounded />}
            Semanas anteriores <span className="lg-grupo-total">{anteriores.length}</span>
          </button>
          {anterioresAbertas && anteriores.map((id) => grupo(id, 'anterior'))}
        </section>
      )}
    </div>
  );
}
