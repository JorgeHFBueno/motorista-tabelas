import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTituloPagina } from '../../../components/cabecalhoPagina';
import '../erpElevor.css';
import { ehLista, montar, type Item } from '../camposFicha';
import { EMPRESAS, hoje } from '../estoques/estoquesExemplo';
import { LinhaFicha } from '../FichaCampos';
import { PESSOAS_EXEMPLO } from '../pessoas/pessoasExemplo';
import { AVISO_CHEQUES, chequeExemplo, STATUS_CHEQUES, statusCheque } from './chequesExemplo';

// /erp/cheques/:id: Inclusão de Cheques (FN_Cheques do Elevor), como a ficha do ERP do Samuel (cadastro "cheques"): sem Cod,
// rótulos normais à esquerda, Tipo | Empresa, Cliente/Forn., Código Barra, Número, Titular | CPF/CNPJ, Banco | Data
// Lançamento, Valor | Vencimento, Funcionário, OBS e Status | Liquidado. Funcionário e Liquidado não existem no ERP (só
// leitura, como no ERP dele). `novo` abre a ficha vazia, com o status padrão. Demonstração: Gravar e Excluir só avisam.
// The Manuscript, 03_APLICACAO_WEB/01_ROTAS_E_NAVEGACAO.md#erp.

const CAMPOS: Item[] = [
  { rotulo: 'Tipo', tipo: 'opcoes', opcoes: ['Emitido', 'Recebido'], largura: 113 },
  { rotulo: 'Empresa', tipo: 'opcoes', opcoes: EMPRESAS.map((e) => e.nome), largura: 'medio', junto: true },
  { rotulo: 'Cliente/Forn.', tipo: 'opcoes', opcoes: [...PESSOAS_EXEMPLO].sort((a, b) => a.nome.localeCompare(b.nome)).map((p) => p.nome), largura: 'cheio' },
  { rotulo: 'Código Barra', largura: 350 },
  { rotulo: 'Número', largura: 80 },
  { rotulo: 'Titular', largura: 'medio' },
  { rotulo: 'CPF/CNPJ', largura: 170, junto: true },
  { rotulo: 'Banco', largura: 'medio' },
  { rotulo: 'Data Lançamento', tipo: 'data', junto: true, ajuda: 'vazio = hoje' },
  { rotulo: 'Valor', tipo: 'moeda', largura: 100 },
  { rotulo: 'Vencimento', tipo: 'data', junto: true },
  { rotulo: 'Funcionário', largura: 299, desabilitado: true, ajuda: 'O cheque do ERP não guarda o funcionário (campo só leitura).' },
  { rotulo: 'OBS', tipo: 'longo' },
  { rotulo: 'Status', tipo: 'opcoes', opcoes: STATUS_CHEQUES.map((s) => s.descricao), largura: 230 },
  { rotulo: 'Liquidado', largura: 'curto', junto: true, desabilitado: true, ajuda: 'O ERP não marca o cheque como liquidado (campo só leitura).' },
];
const paraCampo = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatarDoc = (d: string) => (d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d);

export default function ErpChequePage() {
  const { id = 'novo' } = useParams();
  const navigate = useNavigate();
  const cheque = id === 'novo' ? null : chequeExemplo(id);
  const [mensagem, setMensagem] = useState('');
  useTituloPagina('Inclusão de Cheques');
  if (id !== 'novo' && !cheque) {
    return (
      <div className="erp-elevor">
        <div className="mensagem">Cheque não encontrado.</div>
        <div className="botoes"><button className="btn" type="button" onClick={() => navigate('/erp/cheques')}>Consulta de Cheques</button></div>
      </div>
    );
  }
  const status = cheque ? statusCheque(cheque.status) : STATUS_CHEQUES.find((s) => s.padrao);
  const valores: Record<string, string> = cheque ? {
    Tipo: cheque.tipo === 'E' ? 'Emitido' : 'Recebido', Empresa: EMPRESAS.find((e) => e.id === cheque.empresa)?.nome ?? '', 'Cliente/Forn.': cheque.pessoa,
    'Código Barra': cheque.codigoBarras, Número: cheque.numero, Titular: cheque.titular, 'CPF/CNPJ': formatarDoc(cheque.documentoTitular), Banco: cheque.banco,
    'Data Lançamento': cheque.data, Valor: paraCampo(cheque.valor), Vencimento: cheque.vencimento, OBS: cheque.observacao, Status: status?.descricao ?? '',
  } : { Tipo: 'Recebido', Empresa: EMPRESAS[0].nome, 'Data Lançamento': hoje(), Status: status?.descricao ?? '' };

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_CHEQUES}</div>
      {/* key: trocar de cheque (ou Novo) recomeça os campos. */}
      <form key={id} className="ficha-cad cheque-ficha" onSubmit={(e) => {
        e.preventDefault();
        setMensagem(`Demonstração: nada foi gravado. ${status && status.movimentacao !== 'nao' ? `No ERP, o status ${status.descricao} ${status.movimentacao === 'realiza' ? 'lança' : 'estorna'} o valor no banco.` : ''}`.trim());
      }}>
        {montar(CAMPOS).map((linha, n) => (ehLista(linha) ? null : <LinhaFicha key={n} linha={linha} valores={valores} especiais={{}} />))}
        {mensagem && <div className="mensagem">{mensagem}</div>}
        <div className="botoes">
          <button className="btn primario" type="submit">Gravar</button>
          <button className="btn" type="button" onClick={() => { setMensagem(''); navigate('/erp/cheques/novo'); }}>Novo</button>
          <button className="btn" type="button" disabled={!cheque} onClick={() => setMensagem('Demonstração: nada foi excluído.')}>Excluir</button>
          <button className="btn" type="button" onClick={() => navigate('/erp/cheques')}>Consultar</button>
        </div>
      </form>
    </div>
  );
}
