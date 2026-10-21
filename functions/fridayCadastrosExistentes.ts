// Cadastros oficiais do Friday, modo "existente" (C5): um quadro se liga a uma coleção que já existe no sistema.
// Aqui ficam o catálogo dos cadastros aceitos (campos e tipos do contrato de cada coleção), a conciliação dos itens
// com os registros por um campo-chave e o plano da migração. Funções puras, sem Firestore.
// Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md.

import { type CampoOficial, type RotuloOficial } from './fridayCadastroConverter.js';

type AnyRecord = Record<string, any>;

/** Tipos do contrato e as colunas do Friday compatíveis com cada um. */
export type TipoContrato = 'texto' | 'numero' | 'caixa' | 'opcao' | 'data';
export const COLUNAS_COMPATIVEIS: Record<TipoContrato, string[]> = {
  texto: ['texto', 'texto_longo', 'telefone', 'email'],
  numero: ['numero', 'avaliacao'],
  caixa: ['caixa'],
  opcao: ['status'],
  data: ['data'],
};

export type CampoContrato = {
  caminho: string; titulo: string; tipo: TipoContrato; obrigatorio: boolean; nulo: boolean;
  inteiro?: boolean; escala?: number; somente_leitura?: boolean; opcoes?: string[]; padrao?: unknown;
};
export type CadastroExistente = {
  colecao: string; nome: string; descricao: string;
  chaves: string[];        // campos aceitos como chave de conciliação
  nome_item: string;       // campo usado para nomear os itens trazidos do cadastro
  campos: CampoContrato[];
  fixos: AnyRecord;        // campos gravados em todo registro criado pelo Friday
};

// veiculos-v2 (Manuscript 01_FIRESTORE/COLECOES/veiculos-v2.md). A quilometragem é do app (só leitura no quadro).
const VEICULOS_V2: CadastroExistente = {
  colecao: 'veiculos-v2',
  nome: 'Veículos (frota V2)',
  descricao: 'Cadastro canônico da frota: placas e itens EXTRA, usados no combustível e nas atividades do app.',
  chaves: ['identificacao.identificador'],
  nome_item: 'identificacao.identificador',
  fixos: { schemaVersion: 2 },
  campos: [
    { caminho: 'identificacao.identificador', titulo: 'Identificador (placa)', tipo: 'texto', obrigatorio: true, nulo: false },
    { caminho: 'identificacao.nome', titulo: 'Nome', tipo: 'texto', obrigatorio: true, nulo: false },
    { caminho: 'identificacao.categoria', titulo: 'Categoria', tipo: 'opcao', obrigatorio: true, nulo: false, opcoes: ['PLACA', 'EXTRA'] },
    { caminho: 'cadastro.ativo', titulo: 'Ativo', tipo: 'caixa', obrigatorio: true, nulo: false, padrao: true },
    { caminho: 'cadastro.anoFabricacao', titulo: 'Ano de fabricação', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true },
    { caminho: 'cadastro.tipoVeiculo', titulo: 'Tipo de veículo', tipo: 'texto', obrigatorio: true, nulo: true },
    { caminho: 'cadastro.empresa', titulo: 'Empresa', tipo: 'texto', obrigatorio: true, nulo: true },
    { caminho: 'cadastro.responsavel', titulo: 'Responsável', tipo: 'texto', obrigatorio: true, nulo: false, padrao: '' },
    { caminho: 'capacidades.cargaLiquida', titulo: 'Carga líquida', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true, escala: 10 },
    { caminho: 'capacidades.munck', titulo: 'Munck', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true, escala: 10 },
    { caminho: 'operacional.quilometragemInicial', titulo: 'Quilometragem inicial', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true },
    { caminho: 'operacional.quilometragemUltima', titulo: 'Última quilometragem', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true, somente_leitura: true },
  ],
};

export const CADASTROS_EXISTENTES: CadastroExistente[] = [VEICULOS_V2];
export const cadastroExistente = (colecao: unknown) => CADASTROS_EXISTENTES.find(c => c.colecao === colecao);

/**
 * A conciliação de verdade (gravar) fica travada por cadastro até ser liberada; a simulação é sempre permitida.
 * Liberar = incluir a coleção em FRIDAY_CONCILIACAO_LIBERADA (separadas por vírgula). Em produção, a variável não existe.
 */
export function conciliacaoLiberada(colecao: string, env: string | undefined = process.env.FRIDAY_CONCILIACAO_LIBERADA): boolean {
  return (env ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(colecao);
}

/** Chave do registro (friday-cadastros) de um cadastro existente: "veiculos-v2" → "veiculos_v2_<sufixo>". */
export const chaveDoExistente = (colecao: string, sufixo: string) => `${colecao.replace(/[^a-z0-9]+/g, '_')}_${sufixo}`.slice(0, 40);

// ---------------------------------------------------------------- caminhos (campos aninhados)
export function lerCaminho(doc: AnyRecord | undefined, caminho: string): unknown {
  let atual: unknown = doc;
  for (const parte of caminho.split('.')) {
    if (atual == null || typeof atual !== 'object') return undefined;
    atual = (atual as AnyRecord)[parte];
  }
  return atual;
}
export function gravarCaminho(doc: AnyRecord, caminho: string, valor: unknown): AnyRecord {
  const partes = caminho.split('.');
  let atual = doc;
  for (const parte of partes.slice(0, -1)) atual = (atual[parte] ??= {});
  atual[partes[partes.length - 1]] = valor;
  return doc;
}

/** Chave de conciliação normalizada: sem acento, maiúsculas, só letras e números ("abc-1d23 " → "ABC1D23"). */
export const normalizarChave = (v: unknown) => String(v ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ---------------------------------------------------------------- conciliação dos itens com os registros
export type ItemConciliavel = { id: number; nome: string; valores?: AnyRecord; vinculado?: boolean };
export type RegistroExistente = { id: string; dados: AnyRecord };
/** colunaChave: id da coluna do quadro com a chave, ou null para usar o nome do item. */
export const chaveDoItem = (item: ItemConciliavel, colunaChave: number | null) =>
  normalizarChave(colunaChave == null ? item.nome : item.valores?.[String(colunaChave)]);

export type Analise = {
  casados: { itemId: number; nome: string; registroId: string; chave: string }[];
  ambiguos: { itemId: number; nome: string; chave: string; registroIds: string[] }[];
  semPar: { itemId: number; nome: string; chave: string }[];
  semItem: { registroId: string; chave: string; nome: string }[];
  jaVinculados: number;
};

/**
 * Casa os itens (ainda sem vínculo) com os registros pela chave normalizada. É ambíguo o item cuja chave aparece em
 * mais de um registro, ou o registro procurado por mais de um item. Registros já vinculados a algum item não entram.
 */
export function analisar(itens: ItemConciliavel[], registros: RegistroExistente[], colunaChave: number | null, caminhoChave: string,
  registrosVinculados: Set<string>, nomeItem: string): Analise {
  const porChave = new Map<string, string[]>();
  for (const r of registros) {
    if (registrosVinculados.has(r.id)) continue;
    const k = normalizarChave(lerCaminho(r.dados, caminhoChave));
    if (k) porChave.set(k, [...(porChave.get(k) ?? []), r.id]);
  }
  const livres = itens.filter(i => !i.vinculado);
  const itensPorChave = new Map<string, number>();
  for (const i of livres) { const k = chaveDoItem(i, colunaChave); if (k) itensPorChave.set(k, (itensPorChave.get(k) ?? 0) + 1); }
  const a: Analise = { casados: [], ambiguos: [], semPar: [], semItem: [], jaVinculados: itens.length - livres.length };
  const procurados = new Set<string>();
  for (const i of livres) {
    const chave = chaveDoItem(i, colunaChave);
    const ids = chave ? porChave.get(chave) ?? [] : [];
    if (ids.length) procurados.add(chave);
    if (ids.length === 1 && itensPorChave.get(chave) === 1) a.casados.push({ itemId: i.id, nome: i.nome, registroId: ids[0], chave });
    else if (ids.length) a.ambiguos.push({ itemId: i.id, nome: i.nome, chave, registroIds: ids });
    else a.semPar.push({ itemId: i.id, nome: i.nome, chave });
  }
  for (const r of registros) {
    if (registrosVinculados.has(r.id)) continue;
    const chave = normalizarChave(lerCaminho(r.dados, caminhoChave));
    if (!chave || !procurados.has(chave)) a.semItem.push({ registroId: r.id, chave, nome: String(lerCaminho(r.dados, nomeItem) ?? '') });
  }
  return a;
}

// ---------------------------------------------------------------- campos: colunas ligadas ao contrato
export type Prioridade = 'cadastro' | 'quadro';
/** Campo oficial de um cadastro existente: `chave` é o caminho no documento; demais propriedades vêm do contrato. */
export type CampoExistente = CampoOficial & {
  tipo_contrato: TipoContrato; obrigatorio: boolean; nulo: boolean; inteiro?: boolean; escala?: number; somente_leitura?: boolean; prioridade: Prioridade;
};
export type PedidoLigacao = { caminho: string; coluna_id: number; prioridade?: Prioridade; rotulos?: Record<string, string> };
type ColunaQuadro = { id: number; titulo: string; tipo: string; config?: AnyRecord };

/**
 * Valida as ligações coluna → campo do contrato e monta os campos do registro. A coluna-chave (quando não é o nome do
 * item) precisa estar ligada ao campo-chave. Em campos de opção, cada rótulo usado no Friday precisa de uma opção.
 */
export function montarCamposExistente(cadastro: CadastroExistente, colunas: ColunaQuadro[], pedidos: PedidoLigacao[],
  chave: { coluna_id: number | null; caminho: string }): { campos: CampoExistente[]; erros: string[] } {
  const erros: string[] = [];
  const campos: CampoExistente[] = [];
  const porId = new Map(colunas.map(c => [Number(c.id), c]));
  const caminhos = new Set<string>(), usadas = new Set<number>();
  if (!cadastro.chaves.includes(chave.caminho)) erros.push(`"${chave.caminho}" não é um campo-chave de ${cadastro.colecao}.`);
  if (chave.coluna_id != null && !pedidos.some(p => p.caminho === chave.caminho && Number(p.coluna_id) === chave.coluna_id)) {
    erros.push('A coluna-chave precisa estar ligada ao campo-chave.');
  }
  for (const p of pedidos) {
    const contrato = cadastro.campos.find(c => c.caminho === p.caminho);
    const col = porId.get(Number(p.coluna_id));
    if (!contrato) { erros.push(`"${p.caminho}" não é um campo de ${cadastro.colecao}.`); continue; }
    if (!col) { erros.push(`A coluna ${p.coluna_id} não pertence ao quadro.`); continue; }
    if (caminhos.has(p.caminho)) { erros.push(`"${contrato.titulo}" foi ligado duas vezes.`); continue; }
    if (usadas.has(col.id)) { erros.push(`A coluna "${col.titulo}" foi ligada duas vezes.`); continue; }
    if (!COLUNAS_COMPATIVEIS[contrato.tipo].includes(col.tipo)) { erros.push(`A coluna "${col.titulo}" (${col.tipo}) não combina com "${contrato.titulo}" (${contrato.tipo}).`); continue; }
    let rotulos: RotuloOficial[] | undefined;
    if (contrato.tipo === 'opcao') {
      rotulos = [];
      for (const r of (col.config?.rotulos ?? []) as AnyRecord[]) {
        if (String(r.id) === '0' || !String(r.texto ?? '').trim()) continue;
        const opcao = p.rotulos?.[String(r.id)];
        if (!opcao) { erros.push(`Escolha a opção de "${contrato.titulo}" para o rótulo "${r.texto}".`); continue; }
        if (!contrato.opcoes?.includes(opcao)) { erros.push(`"${opcao}" não é uma opção de "${contrato.titulo}".`); continue; }
        rotulos.push({ codigo: opcao, texto: String(r.texto).trim(), cor: String(r.cor ?? '#c4c4c4'), friday_id: String(r.id) });
      }
    }
    caminhos.add(p.caminho);
    usadas.add(col.id);
    campos.push({
      chave: contrato.caminho, titulo: col.titulo, tipo: col.tipo, coluna_id: col.id, situacao: 'ativo', ...(rotulos ? { rotulos } : {}),
      tipo_contrato: contrato.tipo, obrigatorio: contrato.obrigatorio, nulo: contrato.nulo,
      ...(contrato.inteiro ? { inteiro: true } : {}), ...(contrato.escala ? { escala: contrato.escala } : {}),
      ...(contrato.somente_leitura ? { somente_leitura: true } : {}),
      prioridade: contrato.somente_leitura ? 'cadastro' : p.prioridade === 'quadro' ? 'quadro' : 'cadastro',
    });
  }
  if (!campos.length) erros.push('Ligue pelo menos uma coluna a um campo do cadastro.');
  return { campos, erros };
}

const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * Valor da célula do Friday → valor do contrato. `vazio: true` quando a célula não tem valor (o que gravar fica a
 * cargo de quem chama); `erro` quando o valor não cabe no contrato.
 */
export function valorParaContrato(campo: CampoExistente, valor: unknown): { valor?: unknown; vazio?: true; erro?: string } {
  if (campo.tipo_contrato === 'caixa') return { valor: valor === true || valor === 1 || valor === '1' };
  if (vazio(valor)) return { vazio: true };
  switch (campo.tipo_contrato) {
    case 'texto': return { valor: String(valor).trim() };
    case 'data': return /^\d{4}-\d{2}-\d{2}/.test(String(valor)) ? { valor: String(valor).slice(0, 10) } : { erro: `Data inválida em "${campo.titulo}".` };
    case 'numero': {
      let n = Number(valor);
      if (!Number.isFinite(n)) return { erro: `Número inválido em "${campo.titulo}".` };
      if (campo.escala) n = Math.round(n * campo.escala);
      if (campo.inteiro && !Number.isInteger(n)) return { erro: `"${campo.titulo}" precisa ser um número inteiro.` };
      return { valor: n };
    }
    case 'opcao': {
      const opcao = campo.rotulos?.find(r => r.friday_id === String(valor))?.codigo;
      return opcao ? { valor: opcao } : { erro: `O rótulo escolhido em "${campo.titulo}" não tem opção correspondente no cadastro.` };
    }
    default: return { erro: `Tipo não suportado em "${campo.titulo}".` };
  }
}

/** Valor para gravar a partir da tela: vazio vira null (se o contrato aceita) ou é recusado. */
export function valorParaGravarExistente(campo: CampoExistente, valor: unknown): { valor: unknown } | { erro: string } {
  if (campo.somente_leitura) return { erro: `"${campo.titulo}" é só leitura: o valor vem do cadastro.` };
  const r = valorParaContrato(campo, valor);
  if (r.erro) return { erro: r.erro };
  if (r.vazio) return campo.nulo ? { valor: null } : { erro: `"${campo.titulo}" é obrigatório no cadastro.` };
  return { valor: r.valor };
}

/** Documento novo do cadastro a partir de um item: fixos + padrões + valores do item. Devolve os campos obrigatórios que faltaram. */
export function novoRegistro(cadastro: CadastroExistente, campos: CampoExistente[], item: ItemConciliavel, chave: { coluna_id: number | null; caminho: string }) {
  const doc: AnyRecord = structuredClone(cadastro.fixos);
  const erros: string[] = [];
  for (const c of cadastro.campos) gravarCaminho(doc, c.caminho, c.padrao !== undefined ? c.padrao : c.nulo ? null : undefined);
  if (chave.coluna_id == null) gravarCaminho(doc, chave.caminho, String(item.nome ?? '').trim());
  for (const c of campos) {
    if (c.somente_leitura) continue;
    const r = valorParaContrato(c, item.valores?.[String(c.coluna_id)]);
    if (r.erro) erros.push(r.erro);
    else if (!r.vazio) gravarCaminho(doc, c.chave, r.valor);
  }
  for (const c of cadastro.campos) {
    const v = lerCaminho(doc, c.caminho);
    if (v === undefined || (!c.nulo && (v === null || v === ''  && c.padrao === undefined))) erros.push(`"${c.titulo}" é obrigatório para criar o registro.`);
  }
  return { doc, erros };
}

// ---------------------------------------------------------------- plano da conciliação (simulação e execução usam o mesmo)
export type Decisoes = { criar?: number[]; trazer?: string[]; ambiguos?: Record<string, string> };
export type RelatorioCampo = { caminho: string; titulo: string; iguais: number; preenchidos: number; divergentes: number; mantidos: number; sobrescritos: number; erros: number };
export type Plano = {
  vincular: { itemId: number; registroId: string; gravar: [string, unknown][] }[];
  criar: { itemId: number; doc: AnyRecord }[];
  trazer: { registroId: string; nome: string }[];
  foraDoQuadro: number; deixadosFora: number; ambiguosPendentes: number;
  campos: RelatorioCampo[]; erros: string[];
};

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Plano da conciliação: o que vincular (e o que gravar em cada registro, conforme a prioridade de cada campo), o que
 * criar e o que trazer para o quadro. Itens sem par e não marcados para criar ficam fora; ambíguos sem escolha também.
 */
export function planejar(cadastro: CadastroExistente, campos: CampoExistente[], analise: Analise, itens: ItemConciliavel[],
  registros: RegistroExistente[], decisoes: Decisoes, chave: { coluna_id: number | null; caminho: string }): Plano {
  const porItem = new Map(itens.map(i => [i.id, i]));
  const porRegistro = new Map(registros.map(r => [r.id, r]));
  const plano: Plano = { vincular: [], criar: [], trazer: [], foraDoQuadro: 0, deixadosFora: 0, ambiguosPendentes: 0, campos: [], erros: [] };
  const rel = new Map(campos.map(c => [c.chave, { caminho: c.chave, titulo: c.titulo, iguais: 0, preenchidos: 0, divergentes: 0, mantidos: 0, sobrescritos: 0, erros: 0 }]));
  const pares: { itemId: number; registroId: string }[] = analise.casados.map(c => ({ itemId: c.itemId, registroId: c.registroId }));
  const escolhidos = new Set(pares.map(p => p.registroId));
  for (const a of analise.ambiguos) {
    const escolha = decisoes.ambiguos?.[String(a.itemId)];
    if (escolha && a.registroIds.includes(escolha) && !escolhidos.has(escolha)) { pares.push({ itemId: a.itemId, registroId: escolha }); escolhidos.add(escolha); }
    else plano.ambiguosPendentes++;
  }
  for (const { itemId, registroId } of pares) {
    const item = porItem.get(itemId)!, doc = porRegistro.get(registroId)!.dados;
    const gravar: [string, unknown][] = [];
    for (const c of campos) {
      const r = rel.get(c.chave)!;
      if (c.somente_leitura) continue;
      const v = valorParaContrato(c, item.valores?.[String(c.coluna_id)]);
      if (v.erro) { r.erros++; plano.erros.push(`${item.nome}: ${v.erro}`); continue; }
      if (v.vazio) continue;
      const atual = lerCaminho(doc, c.chave);
      if (igual(atual, v.valor)) { r.iguais++; continue; }
      if (atual == null || atual === '') { r.preenchidos++; gravar.push([c.chave, v.valor]); continue; }
      r.divergentes++;
      if (c.prioridade === 'quadro') { r.sobrescritos++; gravar.push([c.chave, v.valor]); } else r.mantidos++;
    }
    plano.vincular.push({ itemId, registroId, gravar });
  }
  const criar = new Set(decisoes.criar ?? []);
  for (const s of analise.semPar) {
    if (!criar.has(s.itemId)) { plano.deixadosFora++; continue; }
    const item = porItem.get(s.itemId)!;
    const r = novoRegistro(cadastro, campos, item, chave);
    if (r.erros.length) { plano.erros.push(...r.erros.map(e => `${item.nome}: ${e}`)); plano.deixadosFora++; continue; }
    plano.criar.push({ itemId: s.itemId, doc: r.doc });
  }
  const trazer = new Set(decisoes.trazer ?? []);
  for (const s of analise.semItem) {
    if (trazer.has(s.registroId)) plano.trazer.push({ registroId: s.registroId, nome: s.nome || s.chave || s.registroId });
    else plano.foraDoQuadro++;
  }
  plano.campos = [...rel.values()];
  return plano;
}
