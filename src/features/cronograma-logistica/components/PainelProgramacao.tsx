import CloseRounded from '@mui/icons-material/CloseRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';
import Drawer from '@mui/material/Drawer';
import { textoConflito } from '../domain/conflitos';
import type { Programacao } from '../domain/models';
import { rotuloSemana } from '../domain/semanas';
import { CampoEscolha, CampoPeriodo, CampoTexto } from './campos';
import {
  opcaoObra, opcaoPessoa, opcaoVeiculo, refCadastro, refPessoa,
  type AcoesLogistica, type CadastrosLogistica, type ConflitosLogistica,
} from './contexto';

/** Os mesmos campos do Quadro, um embaixo do outro; abre pela linha ou pela barra do calendário. */
export function PainelProgramacao({ programacao, cadastros, conflitos, acoes, onFechar }: {
  programacao: Programacao | null;
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
            <span className="lg-painel-semana">{rotuloSemana(programacao.semanaId)}</span>
            <button type="button" className="lg-btn-icone" onClick={onFechar} aria-label="Fechar"><CloseRounded /></button>
          </div>
          <CampoTexto className="lg-painel-titulo" valor={programacao.item} obrigatorio maximo={200} onSalvar={(item) => acoes.atualizar(programacao.id, { item })} />
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
            <CampoEscolha rotulo="Auxiliar" valor={opcaoPessoa(programacao.auxiliar, cadastros)} opcoes={cadastros.pessoas} onSalvar={(opcao) => acoes.atualizar(programacao.id, { auxiliar: refPessoa(opcao) })} />
          </label>
          <label className="lg-painel-campo"><span>Veículo</span>
            <CampoEscolha rotulo="Veículo" valor={opcaoVeiculo(programacao.veiculo, cadastros)} opcoes={cadastros.veiculos} onSalvar={(opcao) => acoes.atualizar(programacao.id, { veiculo: refCadastro(opcao) })} />
          </label>
          <label className="lg-painel-campo"><span>Obra</span>
            <CampoEscolha rotulo="Obra" valor={opcaoObra(programacao.obra, cadastros)} opcoes={cadastros.obras} onSalvar={(opcao) => acoes.atualizar(programacao.id, { obra: refCadastro(opcao) })} />
          </label>
          <label className="lg-painel-campo"><span>Status</span>
            <CampoTexto valor={programacao.status} maximo={60} placeholder="—" onSalvar={(status) => acoes.atualizar(programacao.id, { status })} />
          </label>
          <button type="button" className="lg-btn lg-btn-perigo" onClick={() => acoes.excluir(programacao)}>
            <DeleteOutlineRounded fontSize="small" /> Excluir programação
          </button>
        </div>
      )}
    </Drawer>
  );
}
