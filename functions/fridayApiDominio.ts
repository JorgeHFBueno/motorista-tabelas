// Regras da API de leitura do Friday (fridayApi.ts), sem Firestore, para serem testadas.
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md ("Leitura do Friday por chave").
import { createHash } from 'node:crypto';

type AnyRecord = Record<string, any>;

/** Chave: "fri_" + 40 letras e números (gerada na tela "Chaves de API" do Friday, só adm2). */
export const formatoChave = (chave: unknown): chave is string => typeof chave === 'string' && /^fri_[A-Za-z0-9]{40}$/.test(chave);
/** O banco guarda só o SHA-256 da chave (id do documento em friday-chaves-api), nunca a chave. */
export const hashChave = (chave: string) => createHash('sha256').update(chave).digest('hex');

/** Quem a chave representa: funcionário ativo com acesso ao Friday (credencial escritorio ou adm2), como nas Rules. */
export function pessoaDaChave(registro: AnyRecord | undefined, funcionario: AnyRecord | undefined): { uid: string; adm2: boolean } | null {
  if (!registro || registro.revogada_em || typeof registro.uid !== 'string') return null;
  const perfis = funcionario?.perfis ?? {};
  if (funcionario?.ativo !== true || (perfis.escritorio !== true && perfis.adm2 !== true)) return null;
  return { uid: registro.uid, adm2: perfis.adm2 === true };
}

/** Quadro que a pessoa vê, como na tela: fora do arquivo e da lixeira; aberto, ou restrito com ela em "acesso"; adm2 vê todos. */
export function podeVerQuadro(quadro: AnyRecord | undefined, pessoa: { uid: string; adm2: boolean }): boolean {
  if (!quadro || quadro.arquivado_em || quadro.excluido_em) return false;
  return pessoa.adm2 || Number(quadro.restrito) !== 1 || (Array.isArray(quadro.acesso) && quadro.acesso.includes(pessoa.uid));
}

const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : vazio(v) ? [] : [String(v)]);
const dataBr = (d: unknown) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : String(d ?? ''));

export type ContextoTexto = { nomePessoa: (uid: string) => string; nomeItem: (id: number) => string | null };

/** Valor de uma célula em texto legível (o que a pessoa leria na tela), ou null quando vazio. Fórmulas vêm já calculadas. */
export function textoCelula(coluna: { tipo: string; config?: AnyRecord }, v: unknown, ctx: ContextoTexto): string | null {
  if (vazio(v)) return null;
  const cfg = coluna.config ?? {};
  switch (coluna.tipo) {
    case 'status': return ((cfg.rotulos ?? []) as AnyRecord[]).find(r => String(r.id) === String(v))?.texto || null;
    case 'lista': return lista(v).map(id => ((cfg.opcoes ?? []) as AnyRecord[]).find(o => String(o.id) === id)?.texto ?? id).join(', ') || null;
    case 'pessoa': return lista(v).map(ctx.nomePessoa).join(', ') || null;
    case 'caixa': return v ? 'Sim' : null;
    case 'numero': { const n = Number(v); return Number.isFinite(n) ? String(cfg.x10 ? n / 10 : n) : String(v); }
    case 'data': return dataBr(v);
    case 'periodo': { const p = v as AnyRecord; return `${dataBr(p.inicio)} a ${dataBr(p.fim)}`; }
    case 'link': { const l = v as AnyRecord | string; return typeof l === 'string' ? l : [l.texto, l.url].filter(Boolean).filter((x, k, a) => a.indexOf(x) === k).join(' — ') || null; }
    case 'arquivos': return (v as AnyRecord[]).map(a => a.nome).filter(Boolean).join(', ') || null;
    // Ligação: nome do item ligado quando a pessoa vê o quadro dele; senão, só o número.
    case 'ligacao': return lista(v).map(id => ctx.nomeItem(Number(id)) ?? `#${id}`).join(', ') || null;
    case 'tempo': {
      const sessoes = ((v as AnyRecord)?.sessoes ?? []) as AnyRecord[];
      const seg = sessoes.reduce((t, s) => t + Math.max(0, ((s.fim ? Date.parse(s.fim) : Date.now()) - Date.parse(s.inicio)) / 1000), 0);
      return sessoes.length ? `${Math.floor(seg / 3600)}h ${String(Math.floor((seg % 3600) / 60)).padStart(2, '0')}m` : null;
    }
    default: return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

/** Valores de um item pelo título da coluna (título repetido ganha " (2)", " (3)"...). */
export function valoresPorTitulo(colunas: { id: number; titulo: string }[], texto: (colunaId: number) => string | null) {
  const out: Record<string, string | null> = {};
  for (const c of colunas) {
    let t = c.titulo || `Coluna ${c.id}`;
    for (let n = 2; t in out; n++) t = `${c.titulo} (${n})`;
    out[t] = texto(c.id);
  }
  return out;
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Palavras da busca (sem acento, só letras e números); cada uma precisa começar uma palavra do nome, como na busca da tela. */
export const palavrasDaBusca = (q: unknown) => semAcento(String(q ?? '')).split(/[^a-z0-9]+/).filter(Boolean).map(p => p.slice(0, 20));
export function casaBusca(nome: unknown, palavras: string[]) {
  const doNome = semAcento(String(nome ?? '')).split(/[^a-z0-9]+/).filter(Boolean);
  return palavras.every(p => doNome.some(w => w.startsWith(p)));
}
