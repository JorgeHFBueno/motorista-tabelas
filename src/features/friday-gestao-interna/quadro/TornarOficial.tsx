import { useState } from 'react';
import { Lock } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { camposOficiais } from '../api.ts';
import { functions } from '../funcoes.ts';
import { Modal, useAvisoRapido } from '../ui/base.tsx';
import { infoTipo, type Coluna } from './tipos.ts';

// "Tornar oficial" (cadastros oficiais, modo novo): escolhe nome e chave do cadastro e as colunas que viram campo
// oficial. A promoção é feita pela Function fridayCadastroPromover (só adm2). Também usado para tornar os subitens
// oficiais (Function fridayCadastroCampos, op "subitens"). Os diálogos por coluna ficam no fim do arquivo.
// Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

// Tipos aceitos nesta etapa (fórmula é calculada; arquivos e ligações vêm depois). Igual a functions/fridayCadastroConverter.ts.
export const TIPOS_OFICIAIS = new Set(['texto', 'texto_longo', 'telefone', 'email', 'numero', 'avaliacao', 'data', 'periodo', 'status', 'lista', 'pessoa', 'caixa', 'link']);
const RESERVADAS = new Set(['nome', 'situacao', 'criado_em', 'atualizado_em', 'criado_por', 'atualizado_por', 'origem', 'posicao']);
const sugerirChave = (titulo: string) => {
  const base = titulo.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!base) return 'campo';
  return /^[a-z]/.test(base) ? base : `c_${base}`.slice(0, 40);
};
const chaveValida = (c: string) => /^[a-z][a-z0-9_]{1,39}$/.test(c);

type Resultado = { chave: string; colecao: string; campos: number; itens_migrados: number; itens_ja_migrados: number; pessoas_sem_funcionario: number };
const promover = httpsCallable<{ quadroId: number; chave: string; nome: string; campos: { coluna_id: number; chave: string }[]; grupo?: string }, Resultado>(functions, 'fridayCadastroPromover', { timeout: 560_000 });

/**
 * subitens: torna oficiais os subitens do quadro (já oficial). `colunas` são então as do quadro de subitens e a chave
 * é a do mapa de subitens dentro do registro do item pai.
 */
export function TornarOficial({ quadro, colunas, subitens, onFechar, onPronto, onConciliar }: {
  quadro: Record<string, unknown>; colunas: Coluna[]; subitens?: { nomeItem: string; chave?: string | null }; onFechar: () => void; onPronto: () => void;
  onConciliar?: () => void; // "Sim, já existe no sistema": abre a conciliação com um cadastro existente (C5)
}) {
  const avisar = useAvisoRapido();
  const [nome, setNome] = useState(String(quadro.nome ?? ''));
  const [chave, setChave] = useState(subitens ? (subitens.chave ?? sugerirChave(`${subitens.nomeItem}s`)) : sugerirChave(String(quadro.nome ?? '')));
  const retomada = !!subitens?.chave;
  const aceitas = colunas.filter(c => TIPOS_OFICIAIS.has(c.tipo));
  const [marcadas, setMarcadas] = useState<Record<number, string>>({});
  // Grupo oficial (opcional, só no quadro principal): null = não marcado.
  const [grupo, setGrupo] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const escolhidas = Object.entries(marcadas).map(([id, k]) => ({ coluna_id: Number(id), chave: k }));
  const repetidas = new Set([...escolhidas.map(e => e.chave), ...(grupo != null ? [grupo] : [])].filter((k, i, l) => l.indexOf(k) !== i));
  const problemaGrupo = grupo == null ? '' : !chaveValida(grupo) ? 'chave inválida' : RESERVADAS.has(grupo) ? 'chave reservada' : repetidas.has(grupo) ? 'chave repetida' : '';
  const invalida = !retomada && ((!subitens && !nome.trim()) || !chaveValida(chave) || (subitens ? RESERVADAS.has(chave) : !escolhidas.length) || !!problemaGrupo
    || escolhidas.some(e => !chaveValida(e.chave) || RESERVADAS.has(e.chave) || repetidas.has(e.chave)));

  const enviar = async () => {
    setErro('');
    setEnviando(true);
    try {
      if (subitens) {
        const r = await camposOficiais({ quadroId: Number(quadro.id), op: 'subitens', chave, campos: escolhidas });
        avisar(`Subitens oficiais em “${r.chave}”: ${Number(r.subitens_migrados) + Number(r.subitens_ja_migrados)} subitens${Number(r.subitens_sem_pai) ? ` (${r.subitens_sem_pai} sem item pai vinculado ficaram livres)` : ''}.`);
      } else {
        const { data } = await promover({ quadroId: Number(quadro.id), chave, nome: nome.trim(), campos: escolhidas, ...(grupo != null ? { grupo } : {}) });
        avisar(`“${nome.trim()}” agora é um cadastro oficial: ${data.campos} campos, ${data.itens_migrados + data.itens_ja_migrados} itens${data.pessoas_sem_funcionario ? ` (${data.pessoas_sem_funcionario} pessoa(s) sem cadastro de funcionário ficaram de fora)` : ''}.`);
      }
      onPronto();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal titulo={subitens ? 'Tornar os subitens oficiais' : 'Tornar este quadro oficial'} largura={620} onClose={() => { if (!enviando) onFechar(); }}
      rodape={<div className="form-acoes"><button type="button" className="fr-btn" disabled={enviando} onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-primario" disabled={invalida || enviando} onClick={() => void enviar()}>{enviando ? 'Migrando…' : retomada ? 'Retomar' : 'Tornar oficial'}</button></div>}>
      {subitens ? (
        <p className="muted fr-small">
          Cada {subitens.nomeItem.toLowerCase()} vira uma entrada do mapa <code>{chave || '…'}</code> dentro do registro oficial do item pai.
          As colunas escolhidas viram <strong>campos oficiais</strong> dos subitens; as outras continuam livres.
          {retomada && <> A promoção anterior foi interrompida: “Retomar” continua com os campos já escolhidos.</>}
        </p>
      ) : (
        <p className="muted fr-small">
          As colunas escolhidas viram <strong>campos oficiais</strong>: os valores migram uma vez para o cadastro <code>cadastro-{chave || '…'}</code> e,
          daí em diante, o quadro lê e grava lá. As outras colunas continuam livres. Campo oficial pode ser renomeado, mas não excluído.
        </p>
      )}
      {!subitens && onConciliar && (
        <div className="oficial-pergunta">
          <span>Esse assunto já existe num cadastro do sistema (por exemplo, a frota em <code>veiculos-v2</code>)?</span>
          <button type="button" className="fr-btn" disabled={enviando} onClick={onConciliar}>Sim, conciliar com um cadastro existente</button>
        </div>
      )}
      {!subitens && <label className="campo-form">Nome do cadastro<input className="input-cheio" value={nome} onChange={e => setNome(e.target.value)} /></label>}
      <label className="campo-form">{subitens ? 'Chave dos subitens no registro (não muda depois)' : 'Chave do cadastro (não muda depois)'}
        <input className="input-cheio" value={chave} disabled={retomada} onChange={e => setChave(e.target.value)} />
        {!chaveValida(chave) && <small className="texto-alerta">Use minúsculas, números e "_", começando por letra.</small>}
      </label>
      {!retomada && (
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
          {!subitens && (
            <div className="oficial-coluna">
              <label className="check-form" title="O nome do grupo de cada item vira um campo do cadastro oficial">
                <input type="checkbox" className="caixa" checked={grupo != null} onChange={e => setGrupo(e.target.checked ? 'grupo' : null)} />
                <Lock size={14} /> Grupo <span className="muted">(nome do grupo de cada item)</span>
              </label>
              {grupo != null && <input className="input-cheio oficial-chave" value={grupo} onChange={e => setGrupo(e.target.value)} />}
              {problemaGrupo && <small className="texto-alerta">{problemaGrupo}</small>}
            </div>
          )}
          {colunas.length > aceitas.length && <p className="muted fr-small">Fórmulas, arquivos e ligações ainda não podem ser campos oficiais e continuam livres.</p>}
        </div>
      )}
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}

/**
 * Grupo oficial num quadro já oficial (só adm2): "ativar" grava o nome do grupo de cada item no cadastro oficial e
 * passa a mantê-lo; "descontinuar" deixa de manter (os documentos guardam o último nome). A chave nunca muda.
 */
export function GrupoOficialDialogo({ quadroId, oficial, modo, onFechar, onPronto }: {
  quadroId: number; oficial: { nome: string; grupo_chave: string | null }; modo: 'ativar' | 'descontinuar'; onFechar: () => void; onPronto: () => void;
}) {
  const avisar = useAvisoRapido();
  const [chave, setChave] = useState(oficial.grupo_chave ?? 'grupo');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const fixa = oficial.grupo_chave != null;
  const invalida = modo === 'ativar' && !fixa && (!chaveValida(chave) || RESERVADAS.has(chave));
  const enviar = async () => {
    setErro('');
    setEnviando(true);
    try {
      const r = await camposOficiais({ quadroId, op: modo === 'ativar' ? 'grupo' : 'grupo_descontinuar', ...(modo === 'ativar' ? { chave } : {}) });
      avisar(modo === 'ativar' ? `O grupo agora é campo oficial (${r.itens} itens atualizados).` : 'O grupo deixou de ser campo oficial.');
      onPronto();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal titulo={modo === 'ativar' ? 'Tornar o grupo oficial' : 'Descontinuar o grupo oficial'} largura={520} onClose={() => { if (!enviando) onFechar(); }}
      rodape={<div className="form-acoes"><button type="button" className="fr-btn" disabled={enviando} onClick={onFechar}>Cancelar</button>
        <button className={`fr-btn ${modo === 'ativar' ? 'btn-primario' : 'btn-perigo-cheio'}`} disabled={invalida || enviando} onClick={() => void enviar()}>
          {enviando ? 'Aguarde…' : modo === 'ativar' ? 'Tornar oficial' : 'Descontinuar'}</button></div>}>
      {modo === 'ativar' ? (
        <>
          <p className="muted fr-small">O nome do grupo de cada item passa a ser gravado no cadastro oficial “{oficial.nome}” e acompanha quando o item muda de grupo ou o grupo é renomeado.</p>
          <label className="campo-form">Chave do campo (não muda depois)
            <input className="input-cheio" value={chave} disabled={fixa} onChange={e => setChave(e.target.value)} />
            {fixa ? <small className="muted">O grupo já foi oficial antes: a chave é a mesma.</small>
              : !chaveValida(chave) ? <small className="texto-alerta">Use minúsculas, números e "_", começando por letra.</small> : RESERVADAS.has(chave) && <small className="texto-alerta">Chave reservada.</small>}
          </label>
        </>
      ) : (
        <p className="muted fr-small">O cadastro oficial deixa de acompanhar os grupos: os documentos guardam o último nome de grupo de cada item. Os grupos do quadro não mudam.</p>
      )}
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}

/**
 * Desfazer a oficialização (só adm2): os valores voltam para as colunas do quadro e dos subitens e o cadastro fica
 * arquivado — nada é apagado. A chave não pode ser reaproveitada.
 */
export function DesfazerOficial({ quadroId, oficial, onFechar, onPronto }: {
  quadroId: number; oficial: { chave: string; nome: string }; onFechar: () => void; onPronto: () => void;
}) {
  const avisar = useAvisoRapido();
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    setErro('');
    setEnviando(true);
    try {
      const r = await camposOficiais({ quadroId, op: 'desfazer' });
      avisar(`“${oficial.nome}” deixou de ser cadastro oficial: valores de volta em ${r.itens_devolvidos} itens${Number(r.subitens_devolvidos) ? ` e ${r.subitens_devolvidos} subitens` : ''}.`);
      onPronto();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal titulo="Desfazer a oficialização" largura={540} onClose={() => { if (!enviando) onFechar(); }}
      rodape={<div className="form-acoes"><button type="button" className="fr-btn" disabled={enviando} onClick={onFechar}>Cancelar</button>
        <button className="fr-btn btn-perigo-cheio" disabled={enviando} onClick={() => void enviar()}>{enviando ? 'Desfazendo…' : 'Desfazer'}</button></div>}>
      <p className="muted fr-small">
        Os valores dos campos oficiais voltam para as colunas deste quadro (e dos subitens), que perdem o cadeado e ficam livres.
        O cadastro <code>{oficial.chave}</code> fica <strong>arquivado</strong>: nada é apagado, mas ele deixa de receber gravações e a chave
        não pode ser reaproveitada. Para oficializar o quadro de novo, use outra chave.
      </p>
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}

/**
 * Por coluna, num quadro (ou subitens) já oficial — só adm2:
 * - "adicionar": a coluna vira campo oficial; os valores dela migram para o registro oficial.
 * - "descontinuar": o campo deixa de ser oficial; os valores voltam para a coluna (que fica livre) e o registro
 *   oficial guarda os dados antigos sem receber novas gravações.
 */
export function CampoOficialDialogo({ quadroId, coluna, modo, onFechar, onPronto }: {
  quadroId: number; coluna: Coluna; modo: 'adicionar' | 'descontinuar'; onFechar: () => void; onPronto: () => void;
}) {
  const avisar = useAvisoRapido();
  const [chave, setChave] = useState(sugerirChave(coluna.titulo));
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const invalida = modo === 'adicionar' && (!chaveValida(chave) || RESERVADAS.has(chave));
  const enviar = async () => {
    setErro('');
    setEnviando(true);
    try {
      const r = await camposOficiais({ quadroId, op: modo, colunaId: coluna.id, ...(modo === 'adicionar' ? { chave } : {}) });
      avisar(modo === 'adicionar' ? `“${coluna.titulo}” agora é campo oficial (${r.itens_migrados} valores migrados).` : `“${coluna.titulo}” deixou de ser campo oficial (${r.valores_devolvidos} valores de volta na coluna).`);
      onPronto();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal titulo={modo === 'adicionar' ? 'Tornar campo oficial' : 'Descontinuar campo oficial'} largura={520} onClose={() => { if (!enviando) onFechar(); }}
      rodape={<div className="form-acoes"><button type="button" className="fr-btn" disabled={enviando} onClick={onFechar}>Cancelar</button>
        <button className={`fr-btn ${modo === 'adicionar' ? 'btn-primario' : 'btn-perigo-cheio'}`} disabled={invalida || enviando} onClick={() => void enviar()}>
          {enviando ? 'Aguarde…' : modo === 'adicionar' ? 'Tornar oficial' : 'Descontinuar'}</button></div>}>
      {modo === 'adicionar' ? (
        <>
          <p className="muted fr-small">Os valores de <strong>{coluna.titulo}</strong> migram para o cadastro oficial e, daí em diante, a coluna lê e grava lá. Campo oficial pode ser renomeado, mas não excluído.</p>
          <label className="campo-form">Chave do campo (não muda depois)
            <input className="input-cheio" value={chave} onChange={e => setChave(e.target.value)} />
            {!chaveValida(chave) ? <small className="texto-alerta">Use minúsculas, números e "_", começando por letra.</small> : RESERVADAS.has(chave) && <small className="texto-alerta">Chave reservada.</small>}
          </label>
        </>
      ) : (
        <p className="muted fr-small">
          Os valores atuais de <strong>{coluna.titulo}</strong> voltam para a coluna, que fica livre (pode ser excluída depois). O cadastro oficial guarda os
          dados antigos desse campo, mas deixa de recebê-lo. A chave <code>{coluna.oficial?.chave}</code> não pode ser reaproveitada.
        </p>
      )}
      {erro && <p className="aviso-erro">{erro}</p>}
    </Modal>
  );
}
