import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Drawer from '@mui/material/Drawer';
import { textoConflito } from '../domain/conflitos';
import { MAX_VEICULOS, type Observacao, type Programacao, type RefPessoa } from '../domain/models';
import { rotuloSemana } from '../domain/semanas';
import { CampoEscolha, CampoEscolhaVarios, CampoPeriodo, CampoStatus, CampoTexto } from './campos';
import {
  opcaoObra, opcaoPessoa, opcoesVeiculos, refCadastro, refPessoa, refsCadastro,
  type AbaPainel, type AcoesLogistica, type CadastrosLogistica, type ConflitosLogistica,
} from './contexto';
import { ObservacoesProgramacao } from './ObservacoesProgramacao';

/** Os campos do Quadro, um embaixo do outro, e as observações; abre pela linha ou pela barra do calendário. */
export function PainelProgramacao({ programacao, aba, onAba, observacoes, eu, cadastros, conflitos, acoes, onFechar }: {
  programacao: Programacao | null;
  aba: AbaPainel;
  onAba: (aba: AbaPainel) => void;
  observacoes: readonly Observacao[];
  eu: RefPessoa;
  cadastros: CadastrosLogistica;
  conflitos: ConflitosLogistica;
  acoes: AcoesLogistica;
  onFechar: () => void;
}) {
  const lista = programacao ? conflitos.get(programacao.id) ?? [] : [];
  return (
    <Drawer anchor="right" open={programacao !== null} onClose={onFechar}>
      {programacao && (
        <div className="lg-painel">
          <div className="lg-painel-topo">
            <span className="lg-painel-semana">{programacao.cod ? `${programacao.cod} · ` : ''}{rotuloSemana(programacao.semanaId)}</span>
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
                <div className="lg-painel-conflitos" role="status">
                  <WarningAmberRounded fontSize="small" />
                  <ul>{lista.map((conflito) => <li key={`${conflito.tipo}-${conflito.outraId}-${conflito.nome}`}>{textoConflito(conflito)}</li>)}</ul>
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
