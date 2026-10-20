// Conversão monday → Friday (coleções friday-*). Funções puras, sem Firestore nem rede, para serem testadas.
// Portado do importador do protótipo "Ledur Gestão" (ledur-app-monday/server/src/importar.ts), adaptado ao modelo
// do Friday no Firestore (ids numéricos, datas locais em texto, índices pessoas/busca).

export type MCol = { id: string; title: string; type: string; settings_str: string };
export type MValor = { id: string; type: string; text: string | null; value: string | null; display_value?: string | null; linked_item_ids?: string[] };
export type MItem = { id: string; name: string; created_at: string; updated_at: string; group: { id: string } | null; parent_item: { id: string } | null; column_values: MValor[] };
export type Rotulo = { id: string; texto: string; cor: string; concluido?: boolean };
type AnyRecord = Record<string, any>;

export const json = (s: string | null | undefined): any => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

// ---------------------------------------------------------------- datas, ids e índices (iguais aos da WEB)
const FORMATO_SP = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
/** Data e hora de São Paulo no formato do Friday: "2026-10-19 14:30:00". */
export const dataLocal = (d: Date | string = new Date()) => FORMATO_SP.format(typeof d === 'string' ? new Date(d) : d).replace('T', ' ');

let ultimoId = 0;
/** Id numérico novo (milissegundos × 1000 + sorteio), como o `novoId` da WEB. */
export function novoId(): number {
  ultimoId = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), ultimoId + 1);
  return ultimoId;
}

/** Id numérico estável de uma pessoa a partir do UID (cyrb53), igual ao `idDoUid` da WEB. */
export function idDoUid(uid: string): number {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < uid.length; i++) {
    const c = uid.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Prefixos das palavras do nome (índice `busca` dos itens), igual ao `prefixosBusca` da WEB. */
export function prefixosBusca(nome: unknown): string[] {
  const prefixos = new Set<string>();
  for (const palavra of semAcento(String(nome ?? '')).split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = palavra.slice(0, 20);
    for (let n = 1; n <= p.length; n++) prefixos.add(p.slice(0, n));
  }
  return [...prefixos].slice(0, 300);
}
/** Ids de pessoas nas colunas "pessoa" (índice `pessoas` dos itens). */
export function pessoasDosValores(valores: AnyRecord | undefined, colunasPessoa: Set<string>): number[] {
  const ids = new Set<number>();
  for (const [k, v] of Object.entries(valores ?? {})) if (colunasPessoa.has(k) && Array.isArray(v)) v.forEach(x => { if (Number.isFinite(Number(x))) ids.add(Number(x)); });
  return [...ids];
}

// ---------------------------------------------------------------- tipos de coluna
/** monday → Friday. null = não importar (calculada pelo próprio monday ou sem equivalente). */
export const TIPO: Record<string, string | null> = {
  status: 'status', dropdown: 'lista', tags: 'lista', text: 'texto', long_text: 'texto_longo', numbers: 'numero',
  date: 'data', timeline: 'periodo', people: 'pessoa', person: 'pessoa', phone: 'telefone', email: 'email', link: 'link',
  checkbox: 'caixa', rating: 'avaliacao', board_relation: 'ligacao', dependency: 'ligacao', time_tracking: 'numero',
  file: 'arquivos', formula: 'formula', mirror: 'texto', location: 'texto', hour: 'texto', week: 'texto', country: 'texto',
  world_clock: 'texto', color_picker: 'texto', vote: 'numero', auto_number: 'numero',
  name: null, subtasks: null, item_id: null, button: null, last_updated: null, creation_log: null, progress: null, unsupported: null, doc: null, direct_doc: null,
};
/** Tipo do Friday para uma coluna do monday (desconhecida vira texto; null = ignorar). */
export const tipoFriday = (tipoMonday: string): string | null => (TIPO[tipoMonday] === undefined ? 'texto' : TIPO[tipoMonday]);

export const LARGURA_PADRAO: Record<string, number> = {
  status: 140, pessoa: 110, data: 120, periodo: 170, numero: 110, caixa: 80, avaliacao: 130,
  texto_longo: 220, ligacao: 180, lista: 160, formula: 180, arquivos: 130,
};

/** Título da coluna no Friday: espelhos são cópia estática do valor. */
export const tituloColuna = (c: MCol) => (c.type === 'mirror' ? `${c.title} (cópia)` : c.title);

/**
 * Configuração da coluna no Friday. Status guardam `origem_rotulos` (índice do rótulo no monday → id no Friday),
 * usado para converter os valores e para acrescentar rótulos novos numa reimportação.
 */
export function configDe(c: MCol): AnyRecord {
  const s = json(c.settings_str) ?? {};
  switch (c.type) {
    case 'status': return mesclarRotulosStatus({}, s);
    case 'dropdown': return { opcoes: ((s.labels ?? []) as { id: number; name: string }[]).map(l => ({ id: String(l.id), texto: l.name, cor: '#c4c4c4' })) };
    case 'tags': return { opcoes: [] };
    case 'numbers': {
      const u = s.unit ?? {};
      const unidade = u.symbol === 'custom' ? u.custom_unit ?? '' : u.symbol === 'none' ? '' : u.symbol ?? '';
      return { unidade, resumo: 'soma' };
    }
    case 'time_tracking': return { unidade: 'h', resumo: 'soma' };
    case 'date': return s.date_format === 'WITH_YEAR' ? { com_ano: true } : {};
    case 'vote': case 'auto_number': return { unidade: '', resumo: 'nenhum' };
    case 'rating': return { maximo: Number(s.limit ?? 5) };
    case 'board_relation': return { quadro_id: null, origem_quadros: ((s.boardIds ?? []) as unknown[]).map(String) };
    case 'dependency': return { quadro_id: null, dependencia: true };
    case 'formula': return { formula: '', formula_monday: String(s.formula ?? '') };
    default: return {};
  }
}

/**
 * Acrescenta à config de um status os rótulos do monday que ainda não estão mapeados (reimportação),
 * sem mexer nos que já existem (podem ter sido renomeados no Friday). Rótulo sem texto = "vazio" (id "0").
 */
export function mesclarRotulosStatus(config: AnyRecord, settings: AnyRecord): AnyRecord {
  const rotulos: Rotulo[] = [...((config.rotulos ?? []) as Rotulo[])];
  const mapa: Record<string, string | null> = { ...(config.origem_rotulos ?? {}) };
  const pos = (settings.labels_positions_v2 ?? {}) as Record<string, number>;
  const idxs = Object.keys(settings.labels ?? {}).sort((a, b) => (pos[a] ?? Number(a)) - (pos[b] ?? Number(b)));
  const usados = new Set(rotulos.map(r => r.id));
  const proximoId = (preferido: string) => {
    if (!usados.has(preferido)) return preferido;
    let n = Math.max(0, ...[...usados].map(Number).filter(Number.isFinite)) + 1;
    while (usados.has(String(n))) n++;
    return String(n);
  };
  const vazio = rotulos.find(r => r.id === '0');
  const semVazio = rotulos.filter(r => r.id !== '0');
  for (const i of idxs) {
    if (i in mapa) continue;
    const texto = String(settings.labels[i] ?? '').trim();
    if (!texto) { mapa[i] = null; continue; }
    const id = proximoId(String(Number(i) + 1));
    usados.add(id);
    mapa[i] = id;
    semVazio.push({ id, texto, cor: settings.labels_colors?.[i]?.color ?? '#c4c4c4', ...(((settings.done_colors ?? []) as number[]).includes(Number(i)) ? { concluido: true } : {}) });
  }
  return { ...config, rotulos: [...semVazio, vazio ?? { id: '0', texto: '', cor: '#c4c4c4' }], origem_rotulos: mapa };
}

/** Acrescenta opções novas de uma lista suspensa (pelo id do monday). */
export function mesclarOpcoesLista(config: AnyRecord, settings: AnyRecord): AnyRecord {
  const opcoes = [...((config.opcoes ?? []) as Rotulo[])];
  const ids = new Set(opcoes.map(o => o.id));
  for (const l of (settings.labels ?? []) as { id: number; name: string }[]) if (!ids.has(String(l.id))) opcoes.push({ id: String(l.id), texto: l.name, cor: '#c4c4c4' });
  return { ...config, opcoes };
}

// ---------------------------------------------------------------- arquivos e fórmulas
export type ArquivoColuna = { nome: string; monday_asset?: number; url?: string };
/** Coluna "Arquivos": só a lista (nome + asset do monday, ou link externo); o conteúdo vem na etapa de Storage. */
export function arquivosDoMonday(valor: unknown): ArquivoColuna[] | null {
  const files = ((valor as { files?: { name?: string; assetId?: number | string; fileType?: string; linkToFile?: string; url?: string }[] } | null)?.files ?? []);
  const lista = files.map((f): ArquivoColuna | null => {
    const nome = String(f.name ?? '').trim() || 'arquivo';
    if (f.fileType === 'ASSET' && f.assetId != null) return { nome, monday_asset: Number(f.assetId) };
    const url = f.linkToFile || f.url;
    return url ? { nome, url: String(url) } : null;
  }).filter((x): x is ArquivoColuna => x != null);
  return lista.length ? lista : null;
}

export type Alvo = { id: number | null; tipoMonday: string };
/** Fórmula do monday ({status_1#labels}) → formato do Friday ({@<id da coluna>#Mod}). */
export function converterFormulaMonday(formula: string, mapa: Map<string, Alvo>): string {
  return formula.replace(/\{([^{}]+)\}/g, (_inteiro, conteudo: string) => {
    const h = conteudo.indexOf('#');
    const idMonday = (h < 0 ? conteudo : conteudo.slice(0, h)).trim();
    const mod = h < 0 ? '' : conteudo.slice(h + 1).replace(/\.+$/, '').trim();
    const alvo = mapa.get(idMonday);
    if (!alvo) return `{?${idMonday}}`;
    if (alvo.tipoMonday === 'name') return '{@nome}';
    if (alvo.tipoMonday === 'creation_log') return '{@criado}';
    if (alvo.tipoMonday === 'last_updated') return '{@atualizado}';
    if (alvo.id == null) return `{?${idMonday}}`;
    // Controle de tempo: o monday entrega segundos; o Friday guarda horas.
    if (alvo.tipoMonday === 'time_tracking') return `({@${alvo.id}}*3600)`;
    return `{@${alvo.id}${mod ? `#${mod}` : ''}}`;
  });
}

// ---------------------------------------------------------------- valores das células
export type ColunaImportada = { id: number; tipoMonday: string; config: AnyRecord };
export type ContextoValor = {
  /** id da pessoa no monday → id numérico em friday-usuarios */
  pessoa: (idMonday: string) => number | undefined;
  /** Opção de "tags" pelo nome (cria na config se não existir); devolve o id da opção. */
  tag?: (col: ColunaImportada, nome: string) => string;
};

/** Valor de uma célula do monday no formato do Friday (null = célula vazia). Ligações devolvem os ids do monday. */
export function valorDe(col: ColunaImportada, cv: MValor, ctx: ContextoValor): unknown {
  const v = json(cv.value);
  switch (col.tipoMonday) {
    case 'status': return v?.index == null ? null : (col.config.origem_rotulos ?? {})[String(v.index)] ?? null;
    case 'dropdown': return Array.isArray(v?.ids) && v.ids.length ? v.ids.map(String) : null;
    case 'tags': {
      const nomes = (cv.text ?? '').split(',').map(t => t.trim()).filter(Boolean);
      if (!nomes.length || !ctx.tag) return null;
      return nomes.map(n => ctx.tag!(col, n));
    }
    case 'text': case 'location': case 'hour': case 'week': case 'country': case 'world_clock': case 'color_picker': return cv.text?.trim() || null;
    case 'long_text': return (v?.text ?? cv.text ?? '').trim() || null;
    case 'numbers': { const n = Number(typeof v === 'string' ? v : cv.text); return cv.text?.trim() && Number.isFinite(n) ? n : null; }
    case 'vote': case 'auto_number': { const n = Number(cv.text); return cv.text && Number.isFinite(n) ? n : null; }
    case 'date': return v?.date ?? null;
    case 'timeline': return v?.from || v?.to ? { inicio: v.from ?? v.to, fim: v.to ?? v.from } : null;
    case 'people': case 'person': {
      const lista = (v?.personsAndTeams ?? (v?.id ? [{ id: v.id, kind: 'person' }] : [])) as { id: number; kind: string }[];
      const ids = lista.filter(p => p.kind === 'person').map(p => ctx.pessoa(String(p.id))).filter((x): x is number => x != null);
      return ids.length ? [...new Set(ids)] : null;
    }
    case 'phone': return v?.phone || cv.text || null;
    case 'email': return v?.email || cv.text || null;
    case 'link': return v?.url ? (v.text && v.text !== v.url ? { url: v.url, texto: v.text } : { url: v.url }) : null;
    case 'checkbox': return v?.checked === true || v?.checked === 'true' ? true : null;
    case 'rating': return v?.rating ? Number(v.rating) : null;
    case 'time_tracking': { const s = Number(v?.duration ?? 0); return s > 0 ? Math.round((s / 3600) * 100) / 100 : null; }
    case 'formula': case 'mirror': return (cv.display_value ?? cv.text ?? '').trim() || null;
    case 'file': return arquivosDoMonday(v);
    case 'board_relation': case 'dependency': return cv.linked_item_ids?.length ? cv.linked_item_ids.map(String) : null;
    default: return cv.text?.trim() || null;
  }
}
export const ehLigacao = (tipoMonday: string) => tipoMonday === 'board_relation' || tipoMonday === 'dependency';

export type ValoresConvertidos = { valores: AnyRecord; ligacoes: Record<string, string[]> };
/** Valores de um item do monday: células normais em `valores`, ligações (ids do monday) em `ligacoes`. */
export function valoresDoItem(item: MItem, colunas: Map<string, ColunaImportada>, ctx: ContextoValor): ValoresConvertidos {
  const valores: AnyRecord = {};
  const ligacoes: Record<string, string[]> = {};
  for (const cv of item.column_values) {
    const col = colunas.get(cv.id);
    if (!col) continue;
    const v = valorDe(col, cv, ctx);
    if (v == null) continue;
    if (ehLigacao(col.tipoMonday)) ligacoes[String(col.id)] = v as string[];
    else valores[String(col.id)] = v;
  }
  return { valores, ligacoes };
}

/** Liga os ids do monday aos itens do Friday já importados; o que não foi achado fica pendente. */
export function resolverLigacoes(ligacoes: Record<string, string[]>, itemPorOrigem: (idMonday: string) => number | undefined) {
  const valores: Record<string, number[]> = {};
  const pendentes: Record<string, string[]> = {};
  for (const [col, ids] of Object.entries(ligacoes)) {
    const achados: number[] = [];
    const faltam: string[] = [];
    for (const id of ids) { const f = itemPorOrigem(id); if (f != null) achados.push(f); else faltam.push(id); }
    if (achados.length) valores[col] = achados;
    if (faltam.length) pendentes[col] = faltam;
  }
  return { valores, pendentes: Object.keys(pendentes).length ? pendentes : null };
}

// ---------------------------------------------------------------- reimportação
export type Decisao = 'criar' | 'atualizar' | 'igual' | 'preservar';
/**
 * O que fazer com um item do monday numa (re)importação:
 * - criar: ainda não existe no Friday;
 * - preservar: alguém mexeu nele no Friday depois da importação (atualizado_em ≠ importado_em);
 * - igual: intocado, e o monday não mudou desde a importação;
 * - atualizar: intocado, e o monday mudou.
 */
export function decidirItem(existente: AnyRecord | undefined, mondayAtualizadoEm: string): Decisao {
  if (!existente) return 'criar';
  if (!existente.importado_em || existente.atualizado_em !== existente.importado_em) return 'preservar';
  return existente.monday_atualizado_em === mondayAtualizadoEm ? 'igual' : 'atualizar';
}

/**
 * Valores atualizados de um item intocado: as colunas que vieram do monday são substituídas (ou apagadas, se
 * vazias no monday); colunas criadas no Friday ficam como estão.
 */
export function mesclarValores(atuais: AnyRecord | undefined, novos: AnyRecord, colunasImportadas: Iterable<number>): AnyRecord {
  const out: AnyRecord = { ...(atuais ?? {}) };
  for (const id of colunasImportadas) delete out[String(id)];
  return { ...out, ...novos };
}

/** Ordem dos grupos do monday ("position" é texto numérico). */
export const ordenarGrupos = <T extends { position: string }>(grupos: T[]) => [...grupos].sort((a, b) => Number(a.position) - Number(b.position));

/** Ids dos quadros de subitens apontados pela coluna "subtasks" do quadro. */
export const quadrosDeSubitens = (colunas: MCol[]) => colunas.filter(c => c.type === 'subtasks').flatMap(c => ((json(c.settings_str)?.boardIds ?? []) as unknown[]).map(String));
