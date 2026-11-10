import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DragIndicatorRounded from '@mui/icons-material/DragIndicatorRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { useState, type CSSProperties } from 'react';
import { textoConflito } from '../domain/conflitos';
import { MAX_VEICULOS, type Programacao } from '../domain/models';
import { posicaoAoSoltar } from '../domain/ordem';
import { rotuloSemana } from '../domain/semanas';
import { CampoEscolha, CampoEscolhaVarios, CampoPeriodo, CampoStatus, CampoTexto } from './campos';
import {
  opcaoObra, opcaoPessoa, opcoesVeiculos, refCadastro, refPessoa, refsCadastro,
  type AcoesLogistica, type CadastrosLogistica, type ConflitosLogistica,
} from './contexto';

export type TipoSemana = 'futura' | 'atual' | 'anterior';

const COR: Record<TipoSemana, string> = { futura: '#2e9d6f', atual: '#2f6fde', anterior: '#9699a6' };

interface Comum {
  cadastros: CadastrosLogistica;
  conflitos: ConflitosLogistica;
  acoes: AcoesLogistica;
  /** Quantas observações cada programação tem. */
  nObservacoes: ReadonlyMap<string, number>;
}

/** Arrastar pela alça reordena dentro da semana; o alvo é a linha antes da qual a arrastada entra (null = no fim). */
interface Arraste {
  arrastando: string | null;
  alvo: string | null | undefined;
  onIniciar: (id: string) => void;
  onAlvo: (antesDe: string | null) => void;
  onSoltar: (antesDe: string | null) => void;
  onTerminar: () => void;
}

function LinhaProgramacao({ programacao, cadastros, conflitos, acoes, nObservacoes, arraste }: Comum & { programacao: Programacao; arraste: Arraste }) {
  const lista = conflitos.get(programacao.id) ?? [];
  const nObs = nObservacoes.get(programacao.id) ?? 0;
  const classes = [
    lista.length ? 'is-conflito' : '',
    arraste.arrastando === programacao.id ? 'is-arrastando' : '',
    arraste.arrastando && arraste.alvo === programacao.id ? 'is-alvo' : '',
  ].filter(Boolean).join(' ');
  return (
    <tr
      className={classes}
      onDragOver={(event) => { if (arraste.arrastando) { event.preventDefault(); arraste.onAlvo(programacao.id); } }}
      onDrop={(event) => { event.preventDefault(); arraste.onSoltar(programacao.id); }}
    >
      <td className="lg-col-cod" title={programacao.cod ? `Código ${programacao.cod}` : 'Gerando o código…'}>{programacao.cod ?? '…'}</td>
      <td className="lg-col-item">
        <span className="lg-item">
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
          {lista.length > 0 && (
            <span className="lg-aviso" title={`Conflito:\n${lista.map(textoConflito).join('\n')}`} aria-label="Conflito">
              <WarningAmberRounded fontSize="small" />
            </span>
          )}
          <CampoTexto valor={programacao.item} obrigatorio maximo={200} onSalvar={(item) => acoes.atualizar(programacao.id, { item })} />
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
      </td>
      <td><CampoPeriodo inicio={programacao.inicio} fim={programacao.fim} onSalvar={(periodo) => acoes.atualizar(programacao.id, periodo)} /></td>
      <td><CampoEscolha rotulo="Motorista" valor={opcaoPessoa(programacao.motorista, cadastros)} opcoes={cadastros.motoristas} onSalvar={(opcao) => acoes.atualizar(programacao.id, { motorista: refPessoa(opcao) })} /></td>
      <td><CampoEscolha rotulo="Auxiliar" valor={opcaoPessoa(programacao.auxiliar, cadastros)} opcoes={cadastros.pessoas} onSalvar={(opcao) => acoes.atualizar(programacao.id, { auxiliar: refPessoa(opcao) })} /></td>
      <td><CampoEscolhaVarios rotulo="Veículos" maximo={MAX_VEICULOS} valores={opcoesVeiculos(programacao.veiculos, cadastros)} opcoes={cadastros.veiculos} onSalvar={(opcoes) => acoes.atualizar(programacao.id, { veiculos: refsCadastro(opcoes) })} /></td>
      <td><CampoEscolha rotulo="Obra" valor={opcaoObra(programacao.obra, cadastros)} opcoes={cadastros.obras} onSalvar={(opcao) => acoes.atualizar(programacao.id, { obra: refCadastro(opcao) })} /></td>
      <td className="lg-col-status"><CampoStatus valor={programacao.status} etiquetas={cadastros.etiquetas} onSalvar={(status) => acoes.atualizar(programacao.id, { status })} onSalvarEtiquetas={acoes.salvarEtiquetas} /></td>
      <td className="lg-col-acao">
        <button type="button" className="lg-btn-icone" onClick={() => acoes.excluir(programacao)} title="Excluir" aria-label={`Excluir ${programacao.item}`}>
          <DeleteOutlineRounded fontSize="small" />
        </button>
      </td>
    </tr>
  );
}

function NovaProgramacao({ onCriar, arraste }: { onCriar: (item: string) => void; arraste: Arraste }) {
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
      <td colSpan={9}>
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

export function GrupoSemana({ semanaId, tipo, programacoes, aberto, onAlternar, ...comum }: Comum & {
  semanaId: string;
  tipo: TipoSemana;
  programacoes: Programacao[];
  aberto: boolean;
  onAlternar: () => void;
}) {
  const nConflitos = programacoes.filter((programacao) => comum.conflitos.has(programacao.id)).length;
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null | undefined>(undefined);
  const terminar = () => { setArrastando(null); setAlvo(undefined); };
  const arraste: Arraste = {
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
      <button type="button" className="lg-grupo-cab" onClick={onAlternar} aria-expanded={aberto}>
        {aberto ? <ExpandMoreRounded /> : <ChevronRightRounded />}
        <span className="lg-grupo-nome">{rotuloSemana(semanaId)}{tipo === 'atual' ? ' (atual)' : ''}</span>
        <span className="lg-grupo-total">{programacoes.length} {programacoes.length === 1 ? 'programação' : 'programações'}</span>
        {nConflitos > 0 && <span className="lg-grupo-conflitos"><WarningAmberRounded fontSize="inherit" /> {nConflitos} com conflito</span>}
      </button>
      {aberto && (
        <div className="lg-tabela-rolagem">
          <table className="lg-tabela">
            <colgroup>
              <col style={{ width: 96 }} /><col style={{ width: 320 }} /><col style={{ width: 250 }} /><col style={{ width: 170 }} /><col style={{ width: 170 }} />
              <col style={{ width: 260 }} /><col style={{ width: 200 }} /><col style={{ width: 150 }} /><col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr><th>Cod</th><th>Item</th><th>Período</th><th>Motorista</th><th>Auxiliar</th><th>Veículos</th><th>Obra</th><th>Status</th><th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {programacoes.map((programacao) => <LinhaProgramacao key={programacao.id} programacao={programacao} arraste={arraste} {...comum} />)}
              <NovaProgramacao onCriar={(item) => comum.acoes.criar(semanaId, item)} arraste={arraste} />
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function QuadroSemanas({ futuras, atual, anteriores, porSemana, ...comum }: Comum & {
  futuras: string[];
  atual: string | null;
  anteriores: string[];
  porSemana: ReadonlyMap<string, Programacao[]>;
}) {
  // Futuras e a atual começam abertas; as anteriores, recolhidas (dentro do grupo também recolhido).
  const [alternadas, setAlternadas] = useState<ReadonlySet<string>>(new Set());
  const [anterioresAbertas, setAnterioresAbertas] = useState(false);
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
