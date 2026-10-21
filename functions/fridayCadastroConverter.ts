// Cadastros oficiais do Friday: conversão dos valores livres de um quadro (friday-itens.valores) para o formato
// estruturado das coleções cadastro-<chave>. Funções puras, sem Firestore. Contrato: The Manuscript,
// 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

type AnyRecord = Record<string, any>;

/** Tipos de coluna que podem virar campo oficial nesta etapa (fórmula é calculada; arquivos e ligações vêm depois). */
export const TIPOS_OFICIAIS = new Set(['texto', 'texto_longo', 'telefone', 'email', 'numero', 'avaliacao', 'data', 'periodo', 'status', 'lista', 'pessoa', 'caixa', 'link']);

/** Campos que todo documento oficial já tem e não podem ser usados como chave de campo. */
export const CHAVES_RESERVADAS = new Set(['nome', 'situacao', 'criado_em', 'atualizado_em', 'criado_por', 'atualizado_por', 'origem', 'posicao']);

// NFKD também decompõe símbolos como "ª" e "º" (2ª → 2a).
const semAcento = (t: string) => t.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Chave técnica a partir de um título: "Vão (m)" → "vao_m". */
export function sugerirChave(titulo: unknown): string {
  const base = semAcento(String(titulo ?? '')).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!base) return 'campo';
  return /^[a-z]/.test(base) ? base : `c_${base}`.slice(0, 40);
}
/** Chave de cadastro ou de campo: minúsculas, números e "_", começando por letra. */
export const chaveValida = (chave: unknown) => typeof chave === 'string' && /^[a-z][a-z0-9_]{1,39}$/.test(chave);

export type RotuloOficial = { codigo: string; texto: string; cor: string; friday_id: string; concluido?: boolean };
/** Rótulos de status/opções de lista com um `codigo` estável (o texto pode ser renomeado depois sem afetar os dados). */
export function rotulosOficiais(rotulos: AnyRecord[] | undefined): RotuloOficial[] {
  const usados = new Set<string>();
  const out: RotuloOficial[] = [];
  for (const r of rotulos ?? []) {
    const texto = String(r.texto ?? '').trim();
    if (!texto || String(r.id) === '0') continue; // rótulo "vazio" do Friday não é um valor
    let codigo = sugerirChave(texto), n = 2;
    while (usados.has(codigo)) codigo = `${sugerirChave(texto).slice(0, 36)}_${n++}`;
    usados.add(codigo);
    out.push({ codigo, texto, cor: String(r.cor ?? '#c4c4c4'), friday_id: String(r.id), ...(r.concluido ? { concluido: true } : {}) });
  }
  return out;
}

export type CampoOficial = { chave: string; titulo: string; tipo: string; coluna_id: number; rotulos?: RotuloOficial[]; situacao: 'ativo' | 'descontinuado' };
export type PedidoCampo = { coluna_id: number; chave: string };
export type Coluna = { id: number; titulo: string; tipo: string; config?: AnyRecord };

/** Valida os campos pedidos contra as colunas do quadro e monta os campos do registro. Devolve os erros, se houver. */
export function montarCampos(colunas: Coluna[], pedidos: PedidoCampo[]): { campos: CampoOficial[]; erros: string[] } {
  const erros: string[] = [];
  const campos: CampoOficial[] = [];
  const porId = new Map(colunas.map(c => [Number(c.id), c]));
  const chaves = new Set<string>();
  const colunasUsadas = new Set<number>();
  if (!pedidos.length) erros.push('Escolha pelo menos uma coluna para ser campo oficial.');
  for (const p of pedidos) {
    const col = porId.get(Number(p.coluna_id));
    if (!col) { erros.push(`Coluna ${p.coluna_id} não pertence ao quadro.`); continue; }
    if (!TIPOS_OFICIAIS.has(col.tipo)) { erros.push(`A coluna "${col.titulo}" (${col.tipo}) não pode ser campo oficial nesta etapa.`); continue; }
    if (!chaveValida(p.chave)) { erros.push(`Chave inválida para "${col.titulo}": use minúsculas, números e "_", começando por letra.`); continue; }
    if (CHAVES_RESERVADAS.has(p.chave)) { erros.push(`A chave "${p.chave}" é reservada.`); continue; }
    if (chaves.has(p.chave)) { erros.push(`A chave "${p.chave}" foi usada duas vezes.`); continue; }
    if (colunasUsadas.has(col.id)) { erros.push(`A coluna "${col.titulo}" foi escolhida duas vezes.`); continue; }
    chaves.add(p.chave);
    colunasUsadas.add(col.id);
    const rotulos = col.tipo === 'status' ? rotulosOficiais(col.config?.rotulos) : col.tipo === 'lista' ? rotulosOficiais(col.config?.opcoes) : undefined;
    campos.push({ chave: p.chave, titulo: col.titulo, tipo: col.tipo, coluna_id: col.id, ...(rotulos ? { rotulos } : {}), situacao: 'ativo' });
  }
  return { campos, erros };
}

const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Valor livre do Friday → valor oficial. `undefined` = sem valor (o campo não é gravado).
 * `uidDe` converte o id numérico de friday-usuarios no UID de funcionarios (pessoas sem funcionário ficam de fora).
 */
export function valorOficial(campo: CampoOficial, valor: unknown, uidDe: (idFriday: number) => string | undefined): unknown {
  if (vazio(valor)) return undefined;
  switch (campo.tipo) {
    case 'texto': case 'texto_longo': case 'telefone': case 'email': return String(valor);
    case 'numero': case 'avaliacao': { const n = Number(valor); return Number.isFinite(n) ? n : undefined; }
    case 'data': return /^\d{4}-\d{2}-\d{2}/.test(String(valor)) ? String(valor).slice(0, 10) : undefined;
    case 'periodo': {
      const v = valor as AnyRecord;
      return v?.inicio || v?.fim ? { inicio: v.inicio ?? null, fim: v.fim ?? null } : undefined;
    }
    case 'status': return campo.rotulos?.find(r => r.friday_id === String(valor))?.codigo;
    case 'lista': {
      const codigos = (Array.isArray(valor) ? valor : [valor]).map(id => campo.rotulos?.find(r => r.friday_id === String(id))?.codigo).filter((x): x is string => !!x);
      return codigos.length ? codigos : undefined;
    }
    case 'pessoa': {
      const uids = [...new Set((Array.isArray(valor) ? valor : [valor]).map(id => uidDe(Number(id))).filter((x): x is string => !!x))];
      return uids.length ? uids : undefined;
    }
    case 'caixa': return valor === true || valor === 1 || valor === '1' ? true : undefined;
    case 'link': {
      if (typeof valor === 'string') return { url: valor };
      const v = valor as AnyRecord;
      return v?.url ? (v.texto ? { url: String(v.url), texto: String(v.texto) } : { url: String(v.url) }) : undefined;
    }
    default: return undefined;
  }
}

/** Situação do registro oficial a partir do estado do item no Friday (nada é apagado pela tela). */
export const situacaoDoItem = (item: AnyRecord): 'ativo' | 'arquivado' | 'excluido' => (item.excluido_em ? 'excluido' : item.arquivado_em ? 'arquivado' : 'ativo');

/** Data local do Friday ("2026-10-19 14:30:00", horário de São Paulo, UTC−3) → Date. */
export function dataDoFriday(texto: unknown): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)/.exec(String(texto ?? ''));
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Campos oficiais de um item: os valores convertidos e quantas pessoas ficaram de fora por não serem funcionários. */
export function camposDoItem(campos: CampoOficial[], valores: AnyRecord | undefined, uidDe: (idFriday: number) => string | undefined) {
  const out: AnyRecord = {};
  let pessoasSemFuncionario = 0;
  for (const c of campos) {
    const bruto = valores?.[String(c.coluna_id)];
    const v = valorOficial(c, bruto, uidDe);
    if (c.tipo === 'pessoa' && Array.isArray(bruto)) pessoasSemFuncionario += bruto.filter(id => !uidDe(Number(id))).length;
    if (v !== undefined) out[c.chave] = v;
  }
  return { valores: out, pessoasSemFuncionario };
}

/**
 * Rótulos criados no Friday depois da oficialização: acrescenta ao campo os que ainda não têm `codigo`
 * (os existentes nunca mudam de código). Devolve o campo atualizado e se algo mudou.
 */
export function acrescentarRotulos(campo: CampoOficial, rotulosFriday: AnyRecord[] | undefined): { campo: CampoOficial; mudou: boolean } {
  const atuais = campo.rotulos ?? [];
  const conhecidos = new Set(atuais.map(r => r.friday_id));
  const novos = (rotulosFriday ?? []).filter(r => !conhecidos.has(String(r.id)));
  if (!novos.length) return { campo, mudou: false };
  const usados = new Set(atuais.map(r => r.codigo));
  const acrescentados: RotuloOficial[] = [];
  for (const r of rotulosOficiais(novos)) {
    let codigo = r.codigo, n = 2;
    while (usados.has(codigo)) codigo = `${r.codigo.slice(0, 36)}_${n++}`;
    usados.add(codigo);
    acrescentados.push({ ...r, codigo });
  }
  return acrescentados.length ? { campo: { ...campo, rotulos: [...atuais, ...acrescentados] }, mudou: true } : { campo, mudou: false };
}

/** Índice `pessoas` de um item de quadro oficial: pessoas das colunas livres + das colunas oficiais (UID → id do Friday). */
export function indicePessoas(valoresLivres: AnyRecord | undefined, colunasPessoaLivres: Set<string>, campos: CampoOficial[], oficial: AnyRecord | undefined, idDeUid: (uid: string) => number | undefined): number[] {
  const ids = new Set<number>();
  for (const [k, v] of Object.entries(valoresLivres ?? {})) if (colunasPessoaLivres.has(k) && Array.isArray(v)) v.forEach(x => { if (Number.isFinite(Number(x))) ids.add(Number(x)); });
  for (const c of campos) if (c.tipo === 'pessoa' && c.situacao === 'ativo' && Array.isArray(oficial?.[c.chave])) for (const uid of oficial![c.chave]) { const id = idDeUid(String(uid)); if (id != null) ids.add(id); }
  return [...ids];
}

/** Valor oficial → valor da célula no Friday (o inverso de valorOficial). Usado ao descontinuar um campo. */
export function valorDoOficial(campo: CampoOficial, valor: unknown, idDeUid: (uid: string) => number | undefined): unknown {
  if (valor == null) return undefined;
  // Cadastro existente: números com escala (×10) voltam para a unidade da tela.
  const escala = (campo as CampoOficial & { escala?: number }).escala;
  if (escala && typeof valor === 'number') return valor / escala;
  switch (campo.tipo) {
    case 'caixa': return valor === true ? true : undefined;
    case 'status': return campo.rotulos?.find(r => r.codigo === valor)?.friday_id;
    case 'lista': {
      const ids = (Array.isArray(valor) ? valor : []).map(c => campo.rotulos?.find(r => r.codigo === c)?.friday_id).filter((x): x is string => !!x);
      return ids.length ? ids : undefined;
    }
    case 'pessoa': {
      const ids = (Array.isArray(valor) ? valor : []).map(u => idDeUid(String(u))).filter((x): x is number => x != null);
      return ids.length ? ids : undefined;
    }
    default: return valor;
  }
}

/**
 * Rótulos do Friday → rótulos do campo oficial: atualiza texto, cor e "concluído" dos já conhecidos (o `codigo` nunca
 * muda) e acrescenta os novos. Rótulos que sumiram do Friday continuam no registro (dados antigos usam o código).
 */
export function sincronizarRotulos(campo: CampoOficial, rotulosFriday: AnyRecord[] | undefined): { campo: CampoOficial; mudou: boolean } {
  const porId = new Map((rotulosFriday ?? []).map(r => [String(r.id), r]));
  let mudou = false;
  const atualizados = (campo.rotulos ?? []).map(r => {
    const f = porId.get(r.friday_id);
    if (!f) return r;
    const texto = String(f.texto ?? '').trim() || r.texto;
    const cor = String(f.cor ?? r.cor);
    const concluido = !!f.concluido;
    if (texto === r.texto && cor === r.cor && concluido === !!r.concluido) return r;
    mudou = true;
    const { concluido: _antigo, ...resto } = r;
    void _antigo;
    return { ...resto, texto, cor, ...(concluido ? { concluido: true } : {}) };
  });
  const comNovos = acrescentarRotulos({ ...campo, rotulos: atualizados }, rotulosFriday);
  return { campo: comNovos.campo, mudou: mudou || comNovos.mudou };
}

/** Entrada de um subitem no mapa do registro pai (subitens oficiais). */
export function entradaSubitem(campos: CampoOficial[], subitem: AnyRecord, uidDe: (idFriday: number) => string | undefined) {
  const { valores, pessoasSemFuncionario } = camposDoItem(campos, subitem.valores, uidDe);
  return { entrada: { posicao: Number(subitem.posicao) || 0, nome: String(subitem.nome ?? ''), situacao: situacaoDoItem(subitem), ...valores }, pessoasSemFuncionario };
}

/**
 * Chave já usada no registro (campos, inclusive descontinuados, mapa dos subitens ou grupo oficial)? Devolve a
 * mensagem do conflito ou null. Chaves reservadas são verificadas à parte.
 */
export function conflitoDeChave(registro: { campos?: CampoOficial[]; subitens?: { chave?: string } | null; grupo?: { chave?: string } | null }, chave: string): string | null {
  if ((registro.campos ?? []).some(c => c.chave === chave)) return `A chave "${chave}" já foi usada neste cadastro.`;
  if (registro.subitens?.chave === chave) return `A chave "${chave}" é a dos subitens oficiais.`;
  if (registro.grupo?.chave === chave) return `A chave "${chave}" é a do grupo oficial.`;
  return null;
}
