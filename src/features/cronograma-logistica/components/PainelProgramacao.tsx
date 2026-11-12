import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Drawer from '@mui/material/Drawer';
import { textoCodigo } from '../domain/codigo';
import { MAX_VEICULOS, type Observacao, type Programacao, type RefPessoa } from '../domain/models';
import { rotuloSemana } from '../domain/semanas';
import { CampoEscolha, CampoEscolhaVarios, CampoPeriodo, CampoStatus, CampoTexto } from './campos';
import {
  opcaoObra, opcaoPessoa, opcoesVeiculos, refCadastro, refPessoa, refsCadastro,
  type AbaPainel, type AcoesLogistica, type CadastrosLogistica, type ConflitosLogistica,
} from './contexto';
import { ListaConflitos } from './Conflitos';
import { ObservacoesProgramacao } from './ObservacoesProgramacao';

const autoria = (rotulo: string, ref: RefPessoa | null, em: number | null, cadastros: CadastrosLogistica) => {
  if (!ref) return null;
  const nome = cadastros.nomePessoa(ref.uid, ref.nome) || ref.nome || 'alguém';
  return `${rotulo} por ${nome}${em === null ? '' : ` em ${new Date(em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}`;
};

/** Os campos do Quadro, um embaixo do outro, e as observações; abre pela linha ou pela barra do calendário. */
export function PainelProgramacao({ programacao, aba, onAba, observacoes, eu, cadastros, todosConflitos, acoes, onFechar }: {
  programacao: Programacao | null;
  aba: AbaPainel;
  onAba: (aba: AbaPainel) => void;
  observacoes: readonly Observacao[];
  eu: RefPessoa;
  cadastros: CadastrosLogistica;
  /** Inclusive os ignorados, com "Voltar a avisar". */
  todosConflitos: ConflitosLogistica;
  acoes: AcoesLogistica;
  onFechar: () => void;
}) {
  const lista = programacao ? todosConflitos.get(programacao.id) ?? [] : [];
  const avisando = lista.some((conflito) => !conflito.ignorado);
  return (
    <Drawer anchor="right" open={programacao !== null} onClose={onFechar}>
      {programacao && (
        <div className="lg-painel">
          <div className="lg-painel-topo">
            <span className="lg-painel-semana">{programacao.cod !== null ? `${textoCodigo(programacao.cod)} · ` : ''}{rotuloSemana(programacao.semanaId)}</span>
            <button type="button" className="lg-btn-icone" onClick={onFechar} aria-label="Fechar"><CloseRounded /></button>
          </div>
          <CampoTexto className="lg-painel-titulo" valor={programacao.item} obrigatorio maximo={200} onSalvar={(item) => acoes.atualizar(programacao.id, { item })} />
          <nav className="lg-painel-abas" aria-label="Seções">
            <button type="button" className={aba === 'programacao' ? 'on' : ''} onClick={() => onAba('programacao')}>Programação</button>
            <button type="button" className={aba === 'observacoes' ? 'on' : ''} onClick={() => onAba('observacoes')}>
              Observações{observacoes.length > 0 && <span className="lg-contador">{observacoes.length}</span>}
            </button>
          </nav>
          {aba === 'observacoes' ? (
            <ObservacoesProgramacao programacaoId={programacao.id} observacoes={observacoes} eu={eu} cadastros={cadastros} />
          ) : (
            <>
              {lista.length > 0 && (
                <div className={`lg-painel-conflitos${avisando ? '' : ' is-ignorados'}`} role="status">
                  <WarningAmberRounded fontSize="small" />
                  <ListaConflitos itens={lista.map((conflito) => ({ programacao, conflito }))} acoes={acoes} mostrarLinha={false} />
                </div>
              )}
              <label className="lg-painel-campo"><span>Período</span>
                <CampoPeriodo inicio={programacao.inicio} fim={programacao.fim} onSalvar={(periodo) => acoes.atualizar(programacao.id, periodo)} />
              </label>
              <label className="lg-painel-campo"><span>Motorista</span>
                <CampoEscolha rotulo="Motorista" valor={opcaoPessoa(programacao.motorista, cadastros)} opcoes={cadastros.motoristas} onSalvar={(opcao) => acoes.atualizar(programacao.id, { motorista: refPessoa(opcao) })} />
              </label>
              <label className="lg-painel-campo"><span>Auxiliar</span>
                <CampoEscolha rotulo="Auxiliar" valor={opcaoPessoa(programacao.auxiliar, cadastros)} opcoes={cadastros.auxiliares} onSalvar={(opcao) => acoes.atualizar(programacao.id, { auxiliar: refPessoa(opcao) })} />
              </label>
              <label className="lg-painel-campo"><span>Veículos</span>
                <CampoEscolhaVarios rotulo="Veículos" maximo={MAX_VEICULOS} valores={opcoesVeiculos(programacao.veiculos, cadastros)} opcoes={cadastros.veiculos} onSalvar={(opcoes) => acoes.atualizar(programacao.id, { veiculos: refsCadastro(opcoes) })} />
              </label>
              <label className="lg-painel-campo"><span>Obra</span>
                <CampoEscolha rotulo="Obra" valor={opcaoObra(programacao.obra, cadastros)} opcoes={cadastros.obras} onSalvar={(opcao) => acoes.atualizar(programacao.id, { obra: refCadastro(opcao) })} />
              </label>
              <div className="lg-painel-campo"><span>Status</span>
                <CampoStatus grande valor={programacao.status} etiquetas={cadastros.etiquetas} onSalvar={(status) => acoes.atualizar(programacao.id, { status })} onSalvarEtiquetas={acoes.salvarEtiquetas} />
              </div>
              <label className="lg-painel-campo"><span>Expedição</span>
                <CampoTexto valor={programacao.expedicao} maximo={200} onSalvar={(expedicao) => acoes.atualizar(programacao.id, { expedicao })} />
              </label>
              {programacao.adiamento && (
                <div className="lg-painel-campo"><span>Adiamento</span><span className="lg-painel-adiamento">{programacao.adiamento}</span></div>
              )}
              <p className="lg-painel-autoria">
                {[autoria('Criada', programacao.criadoPor, programacao.criadoEm, cadastros), autoria('Alterada', programacao.modificadoPor, programacao.modificadoEm, cadastros)]
                  .filter(Boolean).join(' · ')}
              </p>
              <button type="button" className="lg-btn lg-btn-perigo" onClick={() => acoes.excluir(programacao)}>
                <DeleteOutlineRounded fontSize="small" /> Excluir programação
              </button>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
