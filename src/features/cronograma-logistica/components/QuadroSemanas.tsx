import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import OpenInFullRounded from '@mui/icons-material/OpenInFullRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import { useState, type CSSProperties } from 'react';
import { textoConflito } from '../domain/conflitos';
import type { Programacao } from '../domain/models';
import { rotuloSemana } from '../domain/semanas';
import { CampoEscolha, CampoPeriodo, CampoTexto } from './campos';
import {
  opcaoObra, opcaoPessoa, opcaoVeiculo, refCadastro, refPessoa,
  type AcoesLogistica, type CadastrosLogistica, type ConflitosLogistica,
} from './contexto';

export type TipoSemana = 'futura' | 'atual' | 'anterior';

const COR: Record<TipoSemana, string> = { futura: '#2e9d6f', atual: '#2f6fde', anterior: '#9699a6' };

interface Comum {
  cadastros: CadastrosLogistica;
  conflitos: ConflitosLogistica;
  acoes: AcoesLogistica;
}

function LinhaProgramacao({ programacao, cadastros, conflitos, acoes }: Comum & { programacao: Programacao }) {
  const lista = conflitos.get(programacao.id) ?? [];
  return (
    <tr className={lista.length ? 'is-conflito' : ''}>
      <td className="lg-col-item">
        <span className="lg-item">
          {lista.length > 0 && (
            <span className="lg-aviso" title={`Conflito:\n${lista.map(textoConflito).join('\n')}`} aria-label="Conflito">
              <WarningAmberRounded fontSize="small" />
            </span>
          )}
          <CampoTexto valor={programacao.item} obrigatorio maximo={200} onSalvar={(item) => acoes.atualizar(programacao.id, { item })} />
          <button type="button" className="lg-abrir" onClick={() => acoes.abrir(programacao.id)} title="Abrir">
            <OpenInFullRounded fontSize="inherit" />
          </button>
        </span>
      </td>
      <td><CampoPeriodo inicio={programacao.inicio} fim={programacao.fim} onSalvar={(periodo) => acoes.atualizar(programacao.id, periodo)} /></td>
      <td><CampoEscolha rotulo="Motorista" valor={opcaoPessoa(programacao.motorista, cadastros)} opcoes={cadastros.motoristas} onSalvar={(opcao) => acoes.atualizar(programacao.id, { motorista: refPessoa(opcao) })} /></td>
      <td><CampoEscolha rotulo="Auxiliar" valor={opcaoPessoa(programacao.auxiliar, cadastros)} opcoes={cadastros.pessoas} onSalvar={(opcao) => acoes.atualizar(programacao.id, { auxiliar: refPessoa(opcao) })} /></td>
      <td><CampoEscolha rotulo="Veículo" valor={opcaoVeiculo(programacao.veiculo, cadastros)} opcoes={cadastros.veiculos} onSalvar={(opcao) => acoes.atualizar(programacao.id, { veiculo: refCadastro(opcao) })} /></td>
      <td><CampoEscolha rotulo="Obra" valor={opcaoObra(programacao.obra, cadastros)} opcoes={cadastros.obras} onSalvar={(opcao) => acoes.atualizar(programacao.id, { obra: refCadastro(opcao) })} /></td>
      <td><CampoTexto valor={programacao.status} maximo={60} placeholder="—" onSalvar={(status) => acoes.atualizar(programacao.id, { status })} /></td>
      <td className="lg-col-acao">
        <button type="button" className="lg-btn-icone" onClick={() => acoes.excluir(programacao)} title="Excluir" aria-label={`Excluir ${programacao.item}`}>
          <DeleteOutlineRounded fontSize="small" />
        </button>
      </td>
    </tr>
  );
}

function NovaProgramacao({ onCriar }: { onCriar: (item: string) => void }) {
  const [texto, setTexto] = useState('');
  const criar = () => {
    const item = texto.trim();
    if (!item) return;
    onCriar(item);
    setTexto('');
  };
  return (
    <tr className="lg-nova">
      <td colSpan={8}>
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
              <col style={{ width: 260 }} /><col style={{ width: 250 }} /><col style={{ width: 170 }} /><col style={{ width: 170 }} />
              <col style={{ width: 200 }} /><col style={{ width: 200 }} /><col style={{ width: 120 }} /><col style={{ width: 40 }} />
            </colgroup>
            <thead>
              <tr><th>Item</th><th>Período</th><th>Motorista</th><th>Auxiliar</th><th>Veículo</th><th>Obra</th><th>Status</th><th aria-label="Ações" /></tr>
            </thead>
            <tbody>
              {programacoes.map((programacao) => <LinhaProgramacao key={programacao.id} programacao={programacao} {...comum} />)}
              <NovaProgramacao onCriar={(item) => comum.acoes.criar(semanaId, item)} />
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
