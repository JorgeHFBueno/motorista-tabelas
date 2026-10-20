import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../funcoes.ts';
import { Modal, useAvisoRapido } from '../ui/base.tsx';
import { infoTipo, type Coluna } from './tipos.ts';

// "Tornar oficial" (cadastros oficiais, modo novo): escolhe nome e chave do cadastro e as colunas que viram campo
// oficial. A promoção é feita pela Function fridayCadastroPromover (só adm2).
// Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

// Tipos aceitos nesta etapa (fórmula é calculada; arquivos e ligações vêm depois). Igual a functions/fridayCadastroConverter.ts.
const TIPOS_OFICIAIS = new Set(['texto', 'texto_longo', 'telefone', 'email', 'numero', 'avaliacao', 'data', 'periodo', 'status', 'lista', 'pessoa', 'caixa', 'link']);
const RESERVADAS = new Set(['nome', 'situacao', 'criado_em', 'atualizado_em', 'criado_por', 'atualizado_por', 'origem']);
const sugerirChave = (titulo: string) => {
  const base = titulo.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!base) return 'campo';
  return /^[a-z]/.test(base) ? base : `c_${base}`.slice(0, 40);
};
const chaveValida = (c: string) => /^[a-z][a-z0-9_]{1,39}$/.test(c);

type Resultado = { chave: string; colecao: string; campos: number; itens_migrados: number; itens_ja_migrados: number; pessoas_sem_funcionario: number };
const promover = httpsCallable<{ quadroId: number; chave: string; nome: string; campos: { coluna_id: number; chave: string }[] }, Resultado>(functions, 'fridayCadastroPromover', { timeout: 560_000 });

export function TornarOficial({ quadro, colunas, onFechar, onPronto }: { quadro: Record<string, unknown>; colunas: Coluna[]; onFechar: () => void; onPronto: () => void }) {
  const avisar = useAvisoRapido();
  const [nome, setNome] = useState(String(quadro.nome ?? ''));
  const [chave, setChave] = useState(sugerirChave(String(quadro.nome ?? '')));
  const aceitas = colunas.filter(c => TIPOS_OFICIAIS.has(c.tipo));
  const [marcadas, setMarcadas] = useState<Record<number, string>>({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const escolhidas = Object.entries(marcadas).map(([id, k]) => ({ coluna_id: Number(id), chave: k }));
  const repetidas = new Set(escolhidas.map(e => e.chave).filter((k, i, l) => l.indexOf(k) !== i));
  const invalida = !nome.trim() || !chaveValida(chave) || !escolhidas.length || escolhidas.some(e => !chaveValida(e.chave) || RESERVADAS.has(e.chave) || repetidas.has(e.chave));

  const enviar = async () => {
    setErro('');
    setEnviando(true);
    try {
      const { data } = await promover({ quadroId: Number(quadro.id), chave, nome: nome.trim(), campos: escolhidas });
      avisar(`“${nome.trim()}” agora é um cadastro oficial: ${data.campos} campos, ${data.itens_migrados + data.itens_ja_migrados} itens${data.pessoas_sem_funcionario ? ` (${data.pessoas_sem_funcionario} pessoa(s) sem cadastro de funcionário ficaram de fora)` : ''}.`);
      onPronto();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo="Tornar este quadro oficial" largura={620} onClose={() => { if (!enviando) onFechar(); }}
      rodape={<div className="form-acoes"><button type="button" className="fr-btn" disabled={enviando} onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-primario" disabled={invalida || enviando} onClick={() => void enviar()}>{enviando ? 'Migrando…' : 'Tornar oficial'}</button></div>}>
      <p className="muted fr-small">
        As colunas escolhidas viram <strong>campos oficiais</strong>: os valores migram uma vez para o cadastro <code>cadastro-{chave || '…'}</code> e,
        daí em diante, o quadro lê e grava lá. As outras colunas continuam livres. Campo oficial pode ser renomeado, mas não excluído.
      </p>
      <label className="campo-form">Nome do cadastro<input className="input-cheio" value={nome} onChange={e => setNome(e.target.value)} /></label>
      <label className="campo-form">Chave do cadastro (não muda depois)
        <input className="input-cheio" value={chave} onChange={e => setChave(e.target.value)} />
        {!chaveValida(chave) && <small className="texto-alerta">Use minúsculas, números e "_", começando por letra.</small>}
      </label>
      <div className="oficial-colunas">
        {aceitas.map(c => {
          const Icone = infoTipo(c.tipo).icone;
          const k = marcadas[c.id];
          const problema = k != null && (!chaveValida(k) ? 'chave inválida' : RESERVADAS.has(k) ? 'chave reservada' : repetidas.has(k) ? 'chave repetida' : '');
          return (
            <div key={c.id} className="oficial-coluna">
              <label className="check-form">
                <input type="checkbox" className="caixa" checked={k != null}
                  onChange={e => setMarcadas(m => { const n = { ...m }; if (e.target.checked) n[c.id] = sugerirChave(c.titulo); else delete n[c.id]; return n; })} />
                <Icone size={14} /> {c.titulo}
              </label>
              {k != null && <input className="input-cheio oficial-chave" value={k} onChange={e => setMarcadas(m => ({ ...m, [c.id]: e.target.value }))} />}
              {problema && <small className="texto-alerta">{problema}</small>}
            </div>
          );
        })}
        {colunas.length > aceitas.length && <p className="muted fr-small">Fórmulas, arquivos e ligações ainda não podem ser campos oficiais e continuam livres.</p>}
      </div>
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}
