// Regras da API de leitura do Friday (fridayApi.ts), sem Firestore, para serem testadas.
// Contrato: The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md ("Leitura do Friday por chave").
import { createHash } from 'node:crypto';

type AnyRecord = Record<string, any>;

/** Chave: "fri_" + 40 letras e números (gerada na tela "Chaves de API" do Friday, só adm2). */
export const formatoChave = (chave: unknown): chave is string => typeof chave === 'string' && /^fri_[A-Za-z0-9]{40}$/.test(chave);
/** O banco guarda só o SHA-256 da chave (id do documento em friday-chaves-api), nunca a chave. */
export const hashChave = (chave: string) => createHash('sha256').update(chave).digest('hex');

/**
 * Quem a chave representa: funcionário ativo com acesso ao Friday (credencial escritorio ou adm2), como nas Rules.
 * escrita: a chave foi criada com escrita (POST); sem isso, só consulta.
 */
export function pessoaDaChave(registro: AnyRecord | undefined, funcionario: AnyRecord | undefined): { uid: string; adm2: boolean; escrita: boolean } | null {
  if (!registro || registro.revogada_em || typeof registro.uid !== 'string') return null;
  const perfis = funcionario?.perfis ?? {};
  if (funcionario?.ativo !== true || (perfis.escritorio !== true && perfis.adm2 !== true)) return null;
  return { uid: registro.uid, adm2: perfis.adm2 === true, escrita: registro.escrita === true };
}

// ---------------------------------------------------------------- escrita (chave com escrita)
/** Pedido de escrita que não pode ser atendido como veio (vira 400 com a mensagem). */
export class EntradaInvalida extends Error {}
const igualTexto = (a: unknown, b: unknown) => semAcento(String(a ?? '')).trim() === semAcento(String(b ?? '')).trim();

/** Coluna pelo id ou pelo título (sem diferenciar maiúsculas e acentos); título repetido é ambíguo. */
export function colunaDoPedido<C extends { id: number; titulo: string }>(colunas: C[], ref: unknown): C {
  if (typeof ref === 'number' || (typeof ref === 'string' && /^\d+$/.test(ref))) {
    const c = colunas.find(x => x.id === Number(ref));
    if (c) return c;
  }
  const achadas = colunas.filter(x => igualTexto(x.titulo, ref));
  if (achadas.length === 1) return achadas[0];
  if (achadas.length > 1) throw new EntradaInvalida(`Há mais de uma coluna “${String(ref)}”; use o id da coluna.`);
  throw new EntradaInvalida(`Coluna “${String(ref)}” não existe neste quadro.`);
}

const partes = (v: unknown): string[] => (Array.isArray(v) ? v.map(x => String(x).trim()) : String(v).split(',').map(x => x.trim())).filter(Boolean);
function dataDaEntrada(v: unknown, titulo: string): string {
  const s = String(v ?? '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/), br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2], br[1]] : [];
  const data = a ? `${a}-${m}-${d}` : '';
  if (!data || Number.isNaN(Date.parse(`${data}T12:00:00Z`)) || new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) !== data) {
    throw new EntradaInvalida(`“${titulo}”: data “${s}” inválida (use AAAA-MM-DD ou DD/MM/AAAA).`);
  }
  return data;
}
function numeroDaEntrada(v: unknown, titulo: string): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v ?? '').trim().replace(/^R\$\s*/, '');
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  if (!s || !Number.isFinite(n)) throw new EntradaInvalida(`“${titulo}”: número “${String(v)}” inválido.`);
  return n;
}

export type ContextoEntrada = { pessoa: (nomeOuUid: string) => string | null };
/**
 * Valor que um robô ou assistente manda (como uma pessoa escreveria) no formato do Friday: status e lista pelo texto
 * do rótulo/opção (ou o id), pessoa pelo nome ou uid, datas AAAA-MM-DD ou DD/MM/AAAA, número com vírgula ou ponto.
 * Nada é criado (rótulo, opção ou pessoa que não existe é recusado). undefined = limpar a célula.
 */
export function valorDaEntrada(coluna: { tipo: string; titulo: string; config?: AnyRecord }, v: unknown, ctx: ContextoEntrada): unknown {
  if (vazio(v)) return undefined;
  const cfg = coluna.config ?? {};
  const t = coluna.titulo;
  switch (coluna.tipo) {
    case 'status': {
      const rotulos = ((cfg.rotulos ?? []) as AnyRecord[]);
      const r = rotulos.find(x => String(x.id) === String(v)) ?? rotulos.find(x => x.texto && igualTexto(x.texto, v));
      if (!r) throw new EntradaInvalida(`“${t}”: rótulo “${String(v)}” não existe (${rotulos.filter(x => x.texto).map(x => x.texto).join(', ')}).`);
      return String(r.id) === '0' ? undefined : String(r.id);
    }
    case 'lista': {
      const opcoes = ((cfg.opcoes ?? []) as AnyRecord[]);
      return partes(v).map(p => {
        const o = opcoes.find(x => String(x.id) === p) ?? opcoes.find(x => igualTexto(x.texto, p));
        if (!o) throw new EntradaInvalida(`“${t}”: opção “${p}” não existe (${opcoes.map(x => x.texto).join(', ')}).`);
        return String(o.id);
      });
    }
    case 'pessoa': return [...new Set(partes(v).map(p => {
      const uid = ctx.pessoa(p);
      if (!uid) throw new EntradaInvalida(`“${t}”: pessoa “${p}” não encontrada (use o nome completo ou o uid).`);
      return uid;
    }))];
    case 'data': return dataDaEntrada(v, t);
    case 'periodo': {
      const p = typeof v === 'object' && !Array.isArray(v) ? (v as AnyRecord) : (() => { const m = String(v).split(/\s+a\s+|\s*→\s*/); return { inicio: m[0], fim: m[1] ?? m[0] }; })();
      const inicio = dataDaEntrada(p.inicio ?? p.fim, t), fim = dataDaEntrada(p.fim ?? p.inicio, t);
      if (fim < inicio) throw new EntradaInvalida(`“${t}”: o fim vem antes do início.`);
      return { inicio, fim };
    }
    case 'numero': { const n = numeroDaEntrada(v, t); return cfg.x10 ? Math.round(n * 10) : n; }
    case 'avaliacao': {
      const n = numeroDaEntrada(v, t);
      if (!Number.isInteger(n) || n < 0 || n > Number(cfg.maximo ?? 5)) throw new EntradaInvalida(`“${t}”: avaliação de 0 a ${Number(cfg.maximo ?? 5)}.`);
      return n || undefined;
    }
    case 'caixa': return v === true || /^(1|sim|s|true|x|marcado)$/i.test(String(v).trim()) ? true : undefined;
    case 'link': {
      const l = typeof v === 'object' ? (v as AnyRecord) : { url: String(v).trim() };
      if (!/^https?:\/\//i.test(String(l.url ?? ''))) throw new EntradaInvalida(`“${t}”: link precisa começar com http:// ou https://.`);
      return l.texto ? { url: String(l.url), texto: String(l.texto) } : { url: String(l.url) };
    }
    case 'texto': case 'texto_longo': case 'telefone': case 'email': return String(v).slice(0, 5000);
    case 'arquivos': throw new EntradaInvalida(`“${t}” é coluna de arquivos: envie o arquivo por POST /itens/{id}/arquivos?nome=…&coluna=${encodeURIComponent(t)}.`);
    default: throw new EntradaInvalida(`“${t}” (${coluna.tipo}) não pode ser gravada pela API.`);
  }
}

/** Menções no texto de uma atualização (@{uid}), como a tela grava. */
export const mencoesDoTexto = (texto: string) => [...new Set([...texto.matchAll(/@\{([^{}\s]+)\}/g)].map(m => m[1]))];

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

// ---------------------------------------------------------------- arquivos (anexos) pela API
/** Limite de um arquivo enviado pela API: o mesmo da tela. */
export const LIMITE_ENVIO = 25 * 1024 * 1024;

/** Nome do arquivo enviado (?nome=): sem pastas nem caracteres de controle, até 200 caracteres. */
export function nomeDoEnvio(nome: unknown): string {
  const n = String(nome ?? '').replace(/[/\\]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  if (!n) throw new EntradaInvalida('Informe o nome do arquivo (?nome=arquivo.pdf) e mande o conteúdo no corpo do pedido.');
  return n;
}

/** Anexo na resposta da API: onde está (coluna pelo título, atualização) e o link de download (com token). */
export const anexoLegivel = (a: AnyRecord, tituloColuna: (id: number) => string | null) => ({
  id: Number(a.id), nome: String(a.nome ?? ''), mime: a.mime ?? null, tamanho: Number(a.tamanho) || 0,
  coluna: a.coluna_id != null ? tituloColuna(Number(a.coluna_id)) : null, atualizacao: a.atualizacao_id != null ? Number(a.atualizacao_id) : null,
  criado_em: a.criado_em ?? null, url: a.url ?? null,
});

/** Entrada da célula de uma coluna de arquivos (como a tela grava). */
export const entradaDaCelula = (a: AnyRecord) => ({ id: Number(a.id), nome: String(a.nome), mime: a.mime ?? null, tamanho: Number(a.tamanho) || 0, url: a.url ?? null });
