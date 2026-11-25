import { useState } from 'react';
import { Link } from 'react-router-dom';
import '../erpElevor.css';
import { Linha, Opcoes } from './campos';
import {
  AVISO_ESTOQUES, custoMedioAtual, EMPRESAS, lerNumero, moeda, MOTIVOS_ACERTO, num, PRODUTOS_EXEMPLO, produtoExemplo, saldoEm, TIPOS_ESTOQUE,
} from './estoquesExemplo';

// /erp/estoques/acerto: Acerto de Estoque avulso, como o do ERP do Samuel (no Elevor o acerto sai da contagem): informa o
// saldo contado (o ERP lança a diferença) ou soma/tira uma quantidade; sempre com motivo. No ERP vira um movimento
// "acerto" no Kardex; o custo unitário só vale quando o acerto aumenta o saldo. Demonstração: nada é gravado.

export default function ErpAcertoEstoquePage() {
  const [f, setF] = useState({ empresa: '1', tipoEstoque: '1', produto: '', modo: 'saldo', quantidade: '', custo: '', motivo: '', observacao: '' });
  const [mensagem, setMensagem] = useState('');
  const campo = (chave: keyof typeof f) => ({ value: f[chave], onChange: (e: { target: { value: string } }) => setF((x) => ({ ...x, [chave]: e.target.value })) });

  const produto = produtoExemplo(Number(f.produto));
  const saldo = produto ? saldoEm(Number(f.empresa), Number(f.tipoEstoque), produto.codigo) : 0;
  const medio = produto ? custoMedioAtual(Number(f.empresa), Number(f.tipoEstoque), produto.codigo) : undefined;
  const quantidade = lerNumero(f.quantidade);
  const novoSaldo = quantidade === undefined ? undefined : f.modo === 'saldo' ? quantidade : saldo + quantidade;

  const gravar = () => {
    if (!produto) return setMensagem('Escolha o produto.');
    if (novoSaldo === undefined) return setMensagem(f.modo === 'saldo' ? 'Informe o saldo contado.' : 'Informe a quantidade.');
    if (novoSaldo === saldo) return setMensagem('O saldo não muda: nada a acertar.');
    if (!f.motivo) return setMensagem('Escolha o motivo.');
    setMensagem(`Demonstração: nada foi gravado. O saldo iria de ${num(saldo)} para ${num(novoSaldo)} ${produto.unidade}.`);
  };

  return (
    <div className="erp-elevor">
      <div className="erp-aviso">{AVISO_ESTOQUES}</div>
      <form className="ficha-elevor" onSubmit={(e) => { e.preventDefault(); gravar(); }}>
        <Linha rotulo="Empresa:" id="acerto-empresa">
          <select id="acerto-empresa" className="campo cheio" {...campo('empresa')}>
            {EMPRESAS.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Estoque:">
          <Opcoes nome="tipo-estoque" valor={f.tipoEstoque} onChange={(v) => setF((x) => ({ ...x, tipoEstoque: v }))}
            opcoes={Object.entries(TIPOS_ESTOQUE).map(([valor, rotulo]) => ({ valor, rotulo }))} />
        </Linha>
        <Linha rotulo="Produto:" id="acerto-produto">
          <select id="acerto-produto" className="campo cheio" {...campo('produto')}>
            <option value="" />
            {PRODUTOS_EXEMPLO.filter((p) => p.ativo).map((p) => <option key={p.codigo} value={p.codigo}>{p.codigo} - {p.descricao}</option>)}
          </select>
        </Linha>
        {produto && (
          <Linha rotulo="Saldo atual:">
            <span>
              <b className={saldo < 0 ? 'negativo' : undefined}>{num(saldo)}</b> {produto.unidade} · custo médio {moeda(medio) || '—'}{' '}
              <Link to={`/erp/estoques/kardex?produto=${produto.codigo}&empresa=${f.empresa}`}>ver Kardex</Link>
            </span>
          </Linha>
        )}
        <Linha rotulo="Tipo de acerto:">
          <Opcoes nome="modo" valor={f.modo} onChange={(v) => setF((x) => ({ ...x, modo: v }))}
            opcoes={[{ valor: 'saldo', rotulo: 'Informar o saldo contado' }, { valor: 'ajuste', rotulo: 'Somar/tirar quantidade' }]} />
        </Linha>
        <Linha rotulo={f.modo === 'saldo' ? 'Saldo contado:' : 'Quantidade (+/−):'} id="acerto-quantidade">
          <input id="acerto-quantidade" className="campo curto num" inputMode="decimal" placeholder={f.modo === 'saldo' ? '' : 'ex.: -12,5'} {...campo('quantidade')} />
          {produto && novoSaldo !== undefined && (
            <span className="muted">{f.modo === 'saldo' ? `diferença: ${num(novoSaldo - saldo)}` : `novo saldo: ${num(novoSaldo)}`}</span>
          )}
        </Linha>
        <Linha rotulo="Custo unitário (entrada):" id="acerto-custo">
          <input id="acerto-custo" className="campo curto num" inputMode="decimal" placeholder="opcional"
            title="Só vale quando o acerto aumenta o saldo; vazio = mantém o custo médio" {...campo('custo')} />
        </Linha>
        <Linha rotulo="Motivo:" id="acerto-motivo">
          <select id="acerto-motivo" className="campo cheio" {...campo('motivo')}>
            <option value="" />{MOTIVOS_ACERTO.map((m) => <option key={m}>{m}</option>)}
          </select>
        </Linha>
        <Linha rotulo="Observação:" id="acerto-observacao"><input id="acerto-observacao" className="campo cheio" {...campo('observacao')} /></Linha>
        {mensagem && <div className="mensagem">{mensagem}</div>}
        <div className="botoes">
          <button className="btn primario" type="submit" disabled={!produto}>Gravar acerto</button>
          <Link className="btn" to="/erp/estoques/relatorios/acertos">Relação de Acertos</Link>
        </div>
      </form>
    </div>
  );
}
