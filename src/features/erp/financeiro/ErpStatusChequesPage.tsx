import { useState } from 'react';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { AVISO_CHEQUES, ROTULO_LIQUIDACAO, ROTULO_MOVIMENTACAO, STATUS_CHEQUES, type Acao, type StatusCheque } from './chequesExemplo';

// /erp/cheques/status: Status de Cheques (CL_ChequesStatus e CD_ChequesStatus do Elevor), como o cadastro do ERP do Samuel:
// a consulta estreita (Cod, Descrição) com Novo, e a ficha na própria tela: Descrição, Movimentação Financeira (o status
// lança, não lança ou estorna o valor no banco), Liquidação Cheque e Status Padrão para Inclusão de Cheques.
// Demonstração: Gravar só avisa. The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const ACOES: Acao[] = ['nao', 'realiza', 'desfaz'];

function Ficha({ status, onConsultar, onNovo }: { status: StatusCheque | null; onConsultar: () => void; onNovo: () => void }) {
  const [mensagem, setMensagem] = useState('');
  const radios = (nome: string, rotulos: Record<Acao, string>, valor: Acao) => (
    <div className="opcoes opcoes-coluna">
      {ACOES.map((a) => <label key={a} className="opcao"><input type="radio" name={nome} defaultChecked={valor === a} /> {rotulos[a]}</label>)}
    </div>
  );
  return (
    <form className="ficha-cad" onSubmit={(e) => { e.preventDefault(); setMensagem('Demonstração: nada foi gravado.'); }}>
      <div className="fc-linha"><div className="fc-rotulo">Cod:</div><div className="fc-controle largo"><input className="campo curto" aria-label="Cod" value={status?.id ?? ''} readOnly /></div></div>
      <div className="fc-linha"><div className="fc-rotulo">Descrição:</div><div className="fc-controle largo"><input className="campo medio" aria-label="Descrição" defaultValue={status?.descricao} /></div></div>
      <div className="fc-linha"><div className="fc-rotulo">Movimentação Financeira:</div><div className="fc-controle largo">{radios('movimentacao', ROTULO_MOVIMENTACAO, status?.movimentacao ?? 'nao')}</div></div>
      <div className="fc-linha"><div className="fc-rotulo">Liquidação Cheque:</div><div className="fc-controle largo">{radios('liquidacao', ROTULO_LIQUIDACAO, status?.liquidacao ?? 'nao')}</div></div>
      <div className="fc-linha"><div className="fc-rotulo" /><div className="fc-controle largo">
        <label className="opcao"><input type="checkbox" defaultChecked={status?.padrao} /> Status Padrão para Inclusão de Cheques</label>
      </div></div>
      {mensagem && <div className="mensagem">{mensagem}</div>}
      <div className="botoes">
        <button className="btn primario" type="submit">Gravar</button>
        <button className="btn" type="button" onClick={onNovo}>Novo</button>
        <button className="btn" type="button" onClick={onConsultar}>Consultar</button>
      </div>
    </form>
  );
}

export default function ErpStatusChequesPage() {
  useTituloPagina('Status de Cheques');
  const [aberto, setAberto] = useState<{ status: StatusCheque | null; chave: number } | undefined>();
  const abrir = (status: StatusCheque | null) => setAberto({ status, chave: Date.now() });
  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_CHEQUES}</div>
      {aberto ? <Ficha key={aberto.chave} status={aberto.status} onConsultar={() => setAberto(undefined)} onNovo={() => abrir(null)} /> : (
        <div className="consulta-cad">
          <div className="botoes"><button className="btn" type="button" onClick={() => abrir(null)}><AddCircleOutlineIcon /> Novo</button></div>
          <table className="grade status-cheques">
            <thead><tr><th>Cod</th><th>Descrição</th><th>Movimentação</th><th>Liquidação</th><th>Padrão</th></tr></thead>
            <tbody>
              {STATUS_CHEQUES.map((s) => (
                <tr key={s.id}>
                  <td><a className="linha-link" href="#" onClick={(e) => { e.preventDefault(); abrir(s); }}>{s.id}</a></td>
                  <td><a className="linha-link" href="#" onClick={(e) => { e.preventDefault(); abrir(s); }}>{s.descricao}</a></td>
                  <td>{ROTULO_MOVIMENTACAO[s.movimentacao]}</td><td>{ROTULO_LIQUIDACAO[s.liquidacao]}</td><td>{s.padrao ? 'Sim' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
