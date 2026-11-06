import { useEffect, useState } from 'react';
import { FichasView } from '../fichas/FichasView';
import { CHAVE_HISTORICO, MAX_HISTORICO, lerHistorico, resumo } from '../fichas/historico';
import { useCarteira } from '../fichas/hooks';

// Carteira: as fichas de agora (desenhadas), recorde e mesadas, e o histórico de transações: o resultado de cada
// rodada dos jogos, os gastos em skills e as mesadas. Lê o que fica neste navegador e se atualiza sozinha.
const quando = (em: number) =>
  new Date(em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');
const sinal = (v: number) => (v > 0 ? `+${v}` : String(v));

export default function CarteiraToy() {
  const carteira = useCarteira();
  const [historico, setHistorico] = useState(lerHistorico);

  useEffect(() => {
    const atualizar = () => setHistorico(lerHistorico());
    window.addEventListener(CHAVE_HISTORICO, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(CHAVE_HISTORICO, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);

  const r = resumo(historico);
  return (
    <div className="dt-carteira">
      <div className="dt-carteira-topo">
        <p className="dt-carteira-total"><span className="dt-jogo-legenda">FICHAS</span>{carteira.fichas}</p>
        <FichasView total={carteira.fichas} />
      </div>
      <p>RECORDE {carteira.recorde} . MESADAS {carteira.mesadas}</p>

      <h3>HISTORICO</h3>
      <p className="dt-carteira-resumo">
        <span>JOGOS <b>{sinal(r.ganhos)}</b> / <b className="dt-carteira-menos">{sinal(r.perdas)}</b></span>
        <span>SKILLS <b className="dt-carteira-menos">{sinal(r.skills)}</b></span>
        <span>MESADAS <b>{sinal(r.mesadas)}</b></span>
      </p>
      {historico.length ? (
        <table>
          <thead>
            <tr><th>QUANDO</th><th>ORIGEM</th><th>O QUE FOI</th><th>FICHAS</th></tr>
          </thead>
          <tbody>
            {historico.map((l, i) => (
              <tr key={`${l.em}-${i}`} className={l.transferencia ? 'dt-carteira-transferencia' : undefined}>
                <td>{quando(l.em)}</td>
                <td>{l.origem}</td>
                <td>{l.detalhe}</td>
                <td className={l.valor < 0 && !l.transferencia ? 'dt-carteira-menos' : undefined}>{sinal(l.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="dt-jogo-legenda">NENHUMA TRANSACAO AINDA. JOGUE OU APRENDA UMA SKILL.</p>
      )}
      <p className="dt-jogo-legenda">AS ULTIMAS {MAX_HISTORICO} TRANSACOES, NESTE NAVEGADOR. HORARIO DE BRASILIA.</p>
    </div>
  );
}
