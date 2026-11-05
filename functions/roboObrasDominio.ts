// Robôs externos de obras: regras de escolha e validação que antes ficavam nos robôs (scripts do Samuel) e passam
// a ser do Friday ("o Friday decide, o robô executa"). Funções puras, sem Firestore.
// Proposta a validar na prática (2026-11-04): The Manuscript, 02_APIS_FUNCTIONS/09_ROBOS_EXTERNOS_DE_OBRAS.md.
import { createHash, timingSafeEqual } from 'node:crypto';
import { lerCaminho, type CampoExistente } from './fridayCadastrosExistentes.js';
import { situacaoDoItem } from './fridayCadastroConverter.js';

type AnyRecord = Record<string, any>;
type Coluna = { id: number; titulo: string; tipo: string };

/** Obras criadas antes desta data tiveram o subcentro casado à mão; a data é fixa de propósito (manual do robô, 3.1). */
export const INICIO_SUBCENTRO = '2026-10-14';
/** Mínimo de colunas preenchidas, além da Empresa, para a obra receber subcentro (regra do Samuel). */
export const MINIMO_PREENCHIDAS = 3;
/** Tipos que o Friday calcula ou que só ligam itens: não contam como "preenchidos" (equivale ao que o monday preenche sozinho). */
const NAO_CONTAM = new Set(['formula', 'ligacao']);
/** Campos do cadastro obras-v2 que o robô do subcentro usa. */
export const CAMPO_SUBCENTRO = 'subcentroErp';
export const CAMPO_EMPRESA = 'empresa';

/** Valor de célula sem conteúdo (rótulo "0" é o rótulo vazio do Friday; caixa desmarcada não conta). */
export function semConteudo(tipo: string, v: unknown): boolean {
  if (v == null || v === false) return true;
  if (typeof v === 'string') return v.trim() === '' || (tipo === 'status' && v === '0');
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as AnyRecord).every(x => x == null || String(x).trim() === '');
  return false;
}

/** Descrição do subcentro no ERP: nome da obra com espaços repetidos trocados por um, cortado em 50 caracteres. */
export const descricaoSubcentro = (nome: unknown) => String(nome ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);

/** Código de subcentro do ERP: só dígitos. */
export const subcentroValido = (codigo: unknown): codigo is string => typeof codigo === 'string' && /^\d+$/.test(codigo);

/** Data "AAAA-MM-DD". */
export const dataValida = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Campos ligados que o robô precisa (subcentro e empresa) entre os campos ativos do cadastro; erro se faltar algum. */
export function camposDoRobo(campos: CampoExistente[]): { subcentro: CampoExistente; empresa: CampoExistente; ativos: CampoExistente[] } | { erro: string } {
  const ativos = campos.filter(c => c.situacao === 'ativo' && !c.secundario);
  const subcentro = ativos.find(c => c.chave === CAMPO_SUBCENTRO);
  const empresa = ativos.find(c => c.chave === CAMPO_EMPRESA);
  if (!subcentro || !empresa) return { erro: 'As colunas Subcentro ERP e Empresa precisam estar ligadas ao cadastro obras-v2.' };
  return { subcentro, empresa, ativos };
}

export type ObraAvaliada = {
  itemId: number; mondayId: string | null; obraId: string; nome: string; descricao: string; criadoEm: string;
  empresa: string | null; preenchidas: number; pronta: boolean; motivo: string | null;
};

/**
 * Avalia uma obra para o subcentro: Empresa preenchida e pelo menos 3 colunas preenchidas, sem contar as calculadas,
 * as ligações e a própria Subcentro ERP. O valor de coluna ligada vem do documento de obras-v2; o de coluna livre, do item.
 */
export function avaliarObra(p: { item: AnyRecord; oficial: AnyRecord | undefined; colunas: Coluna[]; ativos: CampoExistente[]; subcentro: CampoExistente; empresa: CampoExistente }): ObraAvaliada {
  const { item, oficial, colunas, ativos, subcentro, empresa } = p;
  const valorDa = (col: Coluna) => {
    const campo = ativos.find(c => Number(c.coluna_id) === Number(col.id));
    return campo ? lerCaminho(oficial, campo.chave) : item.valores?.[String(col.id)];
  };
  let preenchidas = 0;
  for (const col of colunas) {
    if (NAO_CONTAM.has(col.tipo) || Number(col.id) === Number(subcentro.coluna_id)) continue;
    // Coluna ligada guarda texto no cadastro (ex.: rótulo de Empresa vira o texto); a checagem do rótulo vazio é só para a livre.
    const ligada = ativos.some(c => Number(c.coluna_id) === Number(col.id));
    if (!semConteudo(ligada ? 'texto' : col.tipo, valorDa(col))) preenchidas++;
  }
  const empresaTexto = lerCaminho(oficial, empresa.chave);
  const temEmpresa = !semConteudo('texto', empresaTexto);
  const motivos = [
    ...(temEmpresa ? [] : ['Empresa vazia']),
    ...(preenchidas >= MINIMO_PREENCHIDAS ? [] : [`${preenchidas} coluna(s) preenchida(s); o mínimo é ${MINIMO_PREENCHIDAS}`]),
  ];
  return {
    itemId: Number(item.id), mondayId: item.origem_id != null ? String(item.origem_id) : null, obraId: String(item.vinculo?.id ?? ''), nome: String(item.nome ?? ''), descricao: descricaoSubcentro(item.nome),
    criadoEm: String(item.criado_em ?? ''), empresa: temEmpresa ? String(empresaTexto).trim() : null, preenchidas,
    pronta: motivos.length === 0, motivo: motivos.length ? motivos.join('; ') : null,
  };
}

/** Itens do quadro que podem precisar de subcentro: ativos, ligados ao cadastro e criados desde a data. */
export function candidatos(itens: AnyRecord[], chaveCadastro: string, desde: string): AnyRecord[] {
  return itens.filter(i => i.item_pai_id == null && situacaoDoItem(i) === 'ativo' && i.vinculo?.cadastro === chaveCadastro && i.vinculo?.sub == null
    && String(i.criado_em ?? '').slice(0, 10) >= desde);
}

/** Obras sem subcentro, separadas entre prontas (o robô cria no ERP) e aguardando (com o motivo). */
export function obrasSemSubcentro(p: { itens: AnyRecord[]; oficiais: Map<string, AnyRecord | undefined>; colunas: Coluna[]; campos: CampoExistente[]; chaveCadastro: string; desde: string }) {
  const c = camposDoRobo(p.campos);
  if ('erro' in c) return c;
  const prontas: ObraAvaliada[] = [], aguardando: ObraAvaliada[] = [];
  for (const item of candidatos(p.itens, p.chaveCadastro, p.desde)) {
    const oficial = p.oficiais.get(String(item.vinculo.id));
    if (!oficial) continue; // registro sumiu: não é com o robô
    if (!semConteudo('texto', lerCaminho(oficial, c.subcentro.chave))) continue;
    const obra = avaliarObra({ item, oficial, colunas: p.colunas, ...c });
    (obra.pronta ? prontas : aguardando).push(obra);
  }
  const porData = (a: ObraAvaliada, b: ObraAvaliada) => a.criadoEm.localeCompare(b.criadoEm) || a.itemId - b.itemId;
  return { prontas: prontas.sort(porData), aguardando: aguardando.sort(porData) };
}

/** Decisão ao registrar o subcentro: nunca sobrescreve um valor diferente. */
export function decidirRegistro(atual: unknown, novo: string): 'gravar' | 'ja_gravado' | 'conflito' {
  if (semConteudo('texto', atual)) return 'gravar';
  return String(atual) === novo ? 'ja_gravado' : 'conflito';
}

/** Token do cabeçalho `X-Robo-Token`, sem espaços nas pontas; null sem ele. */
export function tokenDoCabecalho(cabecalho: unknown): string | null {
  const t = String(cabecalho ?? '').trim();
  return t || null;
}

/** Compara o token recebido com o esperado sem vazar o tempo de comparação. Esperado vazio nunca confere. */
export function tokenConfere(recebido: string | null, esperado: string | undefined): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}
