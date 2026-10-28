import { useEffect, useState } from 'react';
import { mudarTipoColuna } from '../api.ts';
import { Modal, useAvisoRapido } from '../ui/base.tsx';
import { fmtNumeroColuna } from '../util.ts';
import { alvosPara, nomeDoAlvo, type Conversao } from './mudarTipo.ts';
import { infoTipo, type Coluna, type Rotulo } from './tipos.ts';

// "Mudar tipo…" da coluna: escolhe o tipo novo, mostra a prévia da conversão (quantos valores convertem e quais ficam
// vazios) e só então grava. Ex.: "Cap. de Carga Liq." importada como texto → Número ×10.
export function MudarTipoDialogo({ coluna, onFechar, onPronto }: { coluna: Coluna; onFechar: () => void; onPronto: () => void }) {
  const avisar = useAvisoRapido();
  const opcoes = alvosPara(coluna);
  const [chave, setChave] = useState(opcoes[0]?.chave ?? '');
  const opcao = opcoes.find(o => o.chave === chave);
  const [previa, setPrevia] = useState<Conversao | null>(null);
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!opcao) return;
    let vivo = true;
    setPrevia(null); setErro('');
    mudarTipoColuna(coluna.id, opcao.alvo).then(r => { if (vivo) setPrevia(r); }).catch(e => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [coluna.id, chave]); // eslint-disable-line react-hooks/exhaustive-deps

  const aplicar = async () => {
    if (!opcao) return;
    setOcupado(true); setErro('');
    try {
      const r = await mudarTipoColuna(coluna.id, opcao.alvo, true);
      avisar(`“${coluna.titulo}” agora é ${nomeDoAlvo(opcao.alvo)}: ${r.convertidos} valores convertidos${r.falhas.length ? `, ${r.falhas.length} ficaram vazios` : ''}.`);
      onPronto();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  // Exemplo de como o valor convertido vai aparecer.
  const mostrar = (valor: unknown) => {
    if (valor == null) return '—';
    if (opcao?.alvo.tipo === 'numero') return fmtNumeroColuna({ x10: opcao.alvo.x10, unidade: coluna.config.unidade, ...(opcao.alvo.semMilhar ? { milhar: false } : {}) }, valor);
    if (opcao?.alvo.tipo === 'status') return ((previa?.config.rotulos ?? []) as Rotulo[]).find(r => r.id === String(valor))?.texto ?? String(valor);
    return String(valor);
  };

  return (
    <Modal titulo={`Mudar o tipo de “${coluna.titulo}”`} largura={560} onClose={() => { if (!ocupado) onFechar(); }}
      rodape={<div className="form-acoes"><button type="button" className="fr-btn" disabled={ocupado} onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-primario" disabled={!previa || ocupado} onClick={() => void aplicar()}>{ocupado ? 'Convertendo…' : 'Mudar tipo'}</button></div>}>
      <p className="muted fr-small">Hoje: <strong>{infoTipo(coluna.tipo).rotulo}{coluna.config.x10 ? ' ×10' : ''}</strong>. {coluna.oficial
        ? 'Campo oficial: só a exibição muda; os valores no cadastro ficam iguais.'
        : 'Os valores de todos os itens (inclusive arquivados) são convertidos para o tipo novo.'}</p>
      <label className="campo-form">Novo tipo
        <select className="input-cheio" value={chave} disabled={ocupado} onChange={e => setChave(e.target.value)}>
          {opcoes.map(o => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}
        </select>
      </label>
      {opcao?.alvo.x10 && <p className="muted fr-small">Número ×10: digite só os números, sem vírgula (205); ao sair da célula aparece 20,5. Guarda o inteiro, como os medidores do combustível e as capacidades da frota.</p>}
      {opcao?.alvo.semMilhar && <p className="muted fr-small">Sem separador de milhar: 2025 aparece como 2025 (não 2.025). Para anos e códigos; o rodapé do grupo deixa de somar a coluna.</p>}
      {coluna.tipo === 'lista' && opcao?.alvo.tipo === 'status' && <p className="muted fr-small">Cada opção da lista vira um rótulo, com o mesmo texto e cor. Uma célula com mais de uma opção marcada não cabe num status e fica vazia (aparece abaixo).</p>}
      {!previa && !erro && <p className="muted fr-small">Calculando a prévia…</p>}
      {previa && !coluna.oficial && (
        <div className="conc-secao">
          <div className="conc-chips">
            <span className="conc-chip ok">{previa.convertidos} valores convertidos</span>
            {previa.falhas.length > 0 && <span className="conc-chip atencao">{previa.falhas.length} ficam vazios</span>}
          </div>
          {previa.mudancas.filter(m => m.valor != null).length > 0 && (
            <p className="muted fr-small">Exemplos: {previa.mudancas.filter(m => m.valor != null).slice(0, 4).map(m => mostrar(m.valor)).join(' · ')}</p>
          )}
          {previa.falhas.length > 0 && (
            <details open={previa.falhas.length <= 10}>
              <summary>Valores que não dão para converter (a célula fica vazia)</summary>
              <div className="conc-lista">
                {previa.falhas.slice(0, 100).map(f => <div key={f.id} className="conc-item"><span>{f.nome}</span><code>{f.original}</code></div>)}
              </div>
            </details>
          )}
        </div>
      )}
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}
