// Cadastros oficiais do Friday, modo "existente" (C5): um quadro se liga a uma coleção que já existe no sistema.
// Aqui ficam o catálogo dos cadastros aceitos (campos e tipos do contrato de cada coleção), a conciliação dos itens
// com os registros por um campo-chave e o plano da migração. Funções puras, sem Firestore.
// Contrato: The Manuscript, 03_APLICACAO_WEB/14_FRIDAY_CADASTROS_OFICIAIS.md e 01_FIRESTORE/COLECOES/veiculos-v2.md.

import { chaveValida, rotulosOficiais, TIPOS_OFICIAIS, valorOficial, type CampoOficial, type RotuloOficial } from './fridayCadastroConverter.js';

type AnyRecord = Record<string, any>;

/** Tipos do contrato e as colunas do Friday compatíveis com cada um (texto aceita rótulo: grava o texto do rótulo). */
export type TipoContrato = 'texto' | 'numero' | 'caixa' | 'opcao' | 'data';
export const COLUNAS_COMPATIVEIS: Record<TipoContrato, string[]> = {
  texto: ['texto', 'texto_longo', 'telefone', 'email', 'status'],
  numero: ['numero', 'avaliacao'],
  caixa: ['caixa'],
  opcao: ['status'],
  data: ['data'],
};

export type CampoContrato = {
  caminho: string; titulo: string; tipo: TipoContrato; obrigatorio: boolean; nulo: boolean;
  inteiro?: boolean; escala?: number; somente_leitura?: boolean; padrao?: unknown;
  exato?: boolean;            // texto guardado como veio (sem tirar espaços), ex.: identificador do ERP
  opcoes?: string[];          // opções fixas do contrato (o adm2 liga cada rótulo a uma)
  opcoes_abertas?: boolean;   // opções vêm dos rótulos do quadro, com código estável ("Disponível" → "disponivel")
  derivado?: boolean;         // calculado a partir de outro campo; não é ligado a coluna
  deriva?: { caminho: string; verdadeiro_quando: string }; // grava também caminho = (código == verdadeiro_quando)
};
export type CadastroExistente = {
  colecao: string; nome: string; descricao: string;
  chaves: string[];        // campos aceitos como chave de conciliação
  nome_item: string;       // campo usado para nomear os itens trazidos do cadastro
  // Chave "o nome do item começa com o identificador": ao criar, a 1ª palavra vai para `identificador` e o resto para `resto`.
  dividir_nome?: { identificador: string; resto: string };
  grupo_livre: string;     // demais colunas viram campos oficiais em `<grupo_livre>.<chave>`
  campos: CampoContrato[];
  fixos: AnyRecord;        // campos gravados em todo registro criado pelo Friday
  // Subitens do quadro ligados a um mapa do documento (`<chave>.<id>.<campo>`), ex.: os LOTEs de um contrato.
  subitens?: { chave: string; nome_caminho: string; ordem_caminho: string; campos: CampoContrato[] };
  // Campo calculado por uma fórmula do quadro (Function fridayObrasSituacao): `caminho` guarda o resultado e
  // `status.caminho` vira `sim` quando o resultado é `quando`, senão `nao`. A coluna fica no registro (formula_situacao).
  situacao_por_formula?: { caminho: string; status: { caminho: string; quando: string; sim: string; nao: string } };
  // Item novo (criado ou duplicado) no quadro já conciliado vira registro na hora, com os padrões do contrato (sem esperar
  // outra conciliação). Item arquivado ou na lixeira deixa `status` em `situacao_por_formula.status.sim` (sai do app).
  cria_registro?: boolean;
};

// veiculos-v2 (Manuscript 01_FIRESTORE/COLECOES/veiculos-v2.md). A quilometragem é do app (só leitura no quadro).
// cadastro.situacao substitui cadastro.ativo, que fica calculado (situacao == "disponivel") até o app e as Rules migrarem.
const VEICULOS_V2: CadastroExistente = {
  colecao: 'veiculos-v2',
  nome: 'Veículos (frota V2)',
  descricao: 'Cadastro canônico da frota: placas e itens EXTRA, usados no combustível e nas atividades do app.',
  chaves: ['identificacao.identificador'],
  nome_item: 'identificacao.identificador',
  dividir_nome: { identificador: 'identificacao.identificador', resto: 'identificacao.nome' },
  grupo_livre: 'friday',
  fixos: { schemaVersion: 2 },
  campos: [
    { caminho: 'identificacao.identificador', titulo: 'Identificador (placa)', tipo: 'texto', obrigatorio: true, nulo: false },
    { caminho: 'identificacao.nome', titulo: 'Nome', tipo: 'texto', obrigatorio: true, nulo: false },
    { caminho: 'identificacao.categoria', titulo: 'Categoria', tipo: 'opcao', obrigatorio: true, nulo: false, opcoes: ['PLACA', 'EXTRA'] },
    { caminho: 'identificacao.corCabine', titulo: 'Cor predominante da cabine', tipo: 'texto', obrigatorio: false, nulo: true },
    { caminho: 'identificacao.corCarroceria', titulo: 'Cor predominante da carroceria', tipo: 'texto', obrigatorio: false, nulo: true },
    { caminho: 'cadastro.situacao', titulo: 'Situação', tipo: 'opcao', obrigatorio: false, nulo: true, opcoes_abertas: true, deriva: { caminho: 'cadastro.ativo', verdadeiro_quando: 'disponivel' } },
    { caminho: 'cadastro.ativo', titulo: 'Ativo (calculado da situação)', tipo: 'caixa', obrigatorio: true, nulo: false, padrao: true, derivado: true },
    { caminho: 'cadastro.anoFabricacao', titulo: 'Ano de fabricação', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true },
    { caminho: 'cadastro.tipoVeiculo', titulo: 'Tipo de veículo', tipo: 'texto', obrigatorio: true, nulo: true },
    { caminho: 'cadastro.empresa', titulo: 'Empresa', tipo: 'texto', obrigatorio: true, nulo: true },
    { caminho: 'cadastro.responsavel', titulo: 'Responsável', tipo: 'texto', obrigatorio: true, nulo: false, padrao: '' },
    { caminho: 'capacidades.cargaLiquida', titulo: 'Carga líquida', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true, escala: 10 },
    { caminho: 'capacidades.munck', titulo: 'Munck', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true, escala: 10 },
    { caminho: 'capacidades.pesoBruto', titulo: 'Peso bruto', tipo: 'numero', obrigatorio: false, nulo: true, inteiro: true, escala: 10 },
    { caminho: 'operacional.local', titulo: 'Local', tipo: 'texto', obrigatorio: false, nulo: true },
    { caminho: 'operacional.chaveTitular', titulo: 'Chave titular', tipo: 'texto', obrigatorio: false, nulo: true },
    { caminho: 'operacional.chaveReserva', titulo: 'Chave reserva', tipo: 'texto', obrigatorio: false, nulo: true },
    { caminho: 'operacional.quilometragemInicial', titulo: 'Quilometragem inicial', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true },
    { caminho: 'operacional.quilometragemUltima', titulo: 'Última quilometragem', tipo: 'numero', obrigatorio: true, nulo: true, inteiro: true, somente_leitura: true },
  ],
};

// obras-v2 (Manuscript 01_FIRESTORE/COLECOES/obras-v2.md): um documento por contrato, LOTEs em `lotes.{id}`.
// O nome do item é o `nomeObra` (nome do contrato). `situacao` e `status` vêm da fórmula "Status" do quadro.
// Código, sigla e local ficam no documento; só entram no quadro se forem ligados a uma coluna.
const opcional = (caminho: string, titulo: string, tipo: TipoContrato, extra: Partial<CampoContrato> = {}): CampoContrato =>
  ({ caminho, titulo, tipo, obrigatorio: true, nulo: true, ...extra });
const OBRAS_V2: CadastroExistente = {
  colecao: 'obras-v2',
  nome: 'Obras (contratos)',
  descricao: 'Cadastro canônico de obras: um contrato por documento, com os LOTEs; usado no combustível, nas atividades do app e no CronoObra.',
  chaves: ['nomeObra'],
  nome_item: 'nomeObra',
  grupo_livre: 'friday',
  fixos: {},
  cria_registro: true, // decisão de 2026-10-27: contrato novo no Friday chega ao app, ao CronoObra e aos Prazos na hora
  campos: [
    { caminho: 'nomeObra', titulo: 'Nome do contrato', tipo: 'texto', obrigatorio: true, nulo: false },
    { caminho: 'siglaObra', titulo: 'Sigla', tipo: 'texto', obrigatorio: true, nulo: false, padrao: '' },
    { caminho: 'codObra', titulo: 'Código (Plannix)', tipo: 'numero', obrigatorio: true, nulo: false, inteiro: true, padrao: 0 },
    { caminho: 'local', titulo: 'Local', tipo: 'texto', obrigatorio: true, nulo: false, padrao: 'CORRIGIR' },
    { caminho: 'status', titulo: 'Status (calculado da fórmula)', tipo: 'opcao', obrigatorio: true, nulo: false, opcoes: ['CONTRATADA', 'FINALIZADA'], padrao: 'CONTRATADA', derivado: true },
    opcional('situacao', 'Situação (resultado da fórmula)', 'texto', { derivado: true }),
    opcional('numeroContrato', 'Nº do contrato', 'texto'),
    opcional('ano', 'Ano', 'numero', { inteiro: true }),
    opcional('empresa', 'Empresa', 'texto'),
    opcional('tipoObra', 'Tipo de obra', 'texto'),
    opcional('subcentroErp', 'Subcentro ERP', 'texto', { exato: true }),
    opcional('ordemInicio', 'Ordem de início', 'texto'),
    opcional('confirmacaoRecurso', 'Confirmação de recurso', 'texto'),
    opcional('dataInicial', 'Início', 'data'),
    opcional('dataFinal', 'Fim', 'data'),
  ],
  subitens: {
    chave: 'lotes', nome_caminho: 'nome', ordem_caminho: 'ordem',
    campos: [{ caminho: 'status', titulo: 'Status do LOTE', tipo: 'texto', obrigatorio: false, nulo: true }],
  },
  situacao_por_formula: { caminho: 'situacao', status: { caminho: 'status', quando: 'Obra Finalizada', sim: 'FINALIZADA', nao: 'CONTRATADA' } },
};

export const CADASTROS_EXISTENTES: CadastroExistente[] = [VEICULOS_V2, OBRAS_V2];
export const cadastroExistente = (colecao: unknown) => CADASTROS_EXISTENTES.find(c => c.colecao === colecao);

/**
 * A conciliação de verdade (gravar) fica travada por cadastro até ser liberada; a simulação é sempre permitida.
 * Liberar = incluir a coleção em FRIDAY_CONCILIACAO_LIBERADA (separadas por vírgula). Em produção, a variável não existe.
 */
export function conciliacaoLiberada(colecao: string, env: string | undefined = process.env.FRIDAY_CONCILIACAO_LIBERADA): boolean {
  return (env ?? '').split(',').map(s => s.trim()).filter(Boolean).includes(colecao);
}

/** Chave do registro (friday-cadastros) de um cadastro existente: "veiculos-v2" → "veiculos_v2_<sufixo>". */
// Marca gravada pela conciliação em cada registro ligado a um item: `<grupo_livre>.ok = true` (apagada ao desfazer).
export const MARCA_VINCULO = 'ok';
export const caminhoDaMarca = (cadastro: CadastroExistente) => `${cadastro.grupo_livre}.${MARCA_VINCULO}`;

export const chaveDoExistente =(colecao: string, sufixo: string) => `${colecao.replace(/[^a-z0-9]+/g, '_')}_${sufixo}`.slice(0, 40);

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
/**
 * coluna_id: coluna do quadro com a chave, ou null para usar o nome do item. modo "prefixo": o valor do item começa com
 * a chave do registro (ex.: item "JBJ-4J22 Mercedez Atego" e identificador "JBJ-4J22"); vale a chave mais longa.
 */
export type ChaveConciliacao = { coluna_id: number | null; caminho: string; modo?: 'igual' | 'prefixo' };
export const chaveDoItem = (item: ItemConciliavel, colunaChave: number | null) =>
  normalizarChave(colunaChave == null ? item.nome : item.valores?.[String(colunaChave)]);
const TAMANHO_MINIMO_PREFIXO = 3;

export type Analise = {
  casados: { itemId: number; nome: string; registroId: string; chave: string }[];
  ambiguos: { itemId: number; nome: string; chave: string; registroIds: string[] }[];
  semPar: { itemId: number; nome: string; chave: string }[];
  semItem: { registroId: string; chave: string; nome: string }[];
  jaVinculados: number;
};

/**
 * Casa os itens (ainda sem vínculo) com os registros. É ambíguo o item que casa com mais de um registro, ou o registro
 * procurado por mais de um item. Registros já vinculados a algum item não entram.
 */
export function analisar(itens: ItemConciliavel[], registros: RegistroExistente[], chave: ChaveConciliacao, registrosVinculados: Set<string>, nomeItem: string): Analise {
  const livresR = registros.filter(r => !registrosVinculados.has(r.id)).map(r => ({ id: r.id, k: normalizarChave(lerCaminho(r.dados, chave.caminho)), dados: r.dados }));
  const prefixo = chave.modo === 'prefixo';
  const candidatos = (k: string): string[] => {
    if (!k) return [];
    if (!prefixo) return livresR.filter(r => r.k && r.k === k).map(r => r.id);
    const achados = livresR.filter(r => r.k.length >= TAMANHO_MINIMO_PREFIXO && k.startsWith(r.k));
    const maior = Math.max(0, ...achados.map(r => r.k.length));
    return achados.filter(r => r.k.length === maior).map(r => r.id);
  };
  const livres = itens.filter(i => !i.vinculado);
  const porItem = livres.map(i => { const k = chaveDoItem(i, chave.coluna_id); return { i, k, ids: candidatos(k) }; });
  const disputa = new Map<string, number>();
  for (const p of porItem) for (const id of p.ids) disputa.set(id, (disputa.get(id) ?? 0) + 1);
  const a: Analise = { casados: [], ambiguos: [], semPar: [], semItem: [], jaVinculados: itens.length - livres.length };
  const procurados = new Set<string>();
  for (const { i, k, ids } of porItem) {
    ids.forEach(id => procurados.add(id));
    if (ids.length === 1 && disputa.get(ids[0]) === 1) a.casados.push({ itemId: i.id, nome: i.nome, registroId: ids[0], chave: k });
    else if (ids.length) a.ambiguos.push({ itemId: i.id, nome: i.nome, chave: k, registroIds: ids });
    else a.semPar.push({ itemId: i.id, nome: i.nome, chave: k });
  }
  for (const r of livresR) if (!procurados.has(r.id)) a.semItem.push({ registroId: r.id, chave: r.k, nome: String(lerCaminho(r.dados, nomeItem) ?? '') });
  return a;
}

// ---------------------------------------------------------------- campos: colunas ligadas ao contrato
export type Prioridade = 'cadastro' | 'quadro';
/**
 * Campo oficial de um cadastro existente: `chave` é o caminho no documento. Campos do contrato trazem `tipo_contrato`;
 * campos do grupo livre (`friday.<chave>`) não têm e seguem as regras dos cadastros novos (status por código etc.).
 */
export type CampoExistente = CampoOficial & {
  tipo_contrato?: TipoContrato; obrigatorio: boolean; nulo: boolean; inteiro?: boolean; escala?: number; somente_leitura?: boolean;
  opcoes_abertas?: boolean; deriva?: { caminho: string; verdadeiro_quando: string }; prioridade: Prioridade; exato?: boolean;
  // Secundário: a coluna já é de outro campo (o principal, que ela mostra); este só é gravado a partir dela.
  secundario?: boolean;
};
/** secundario: a coluna já está ligada a outro campo; este campo de opções fixas é gravado a partir dela, sem mudar o que ela mostra. */
export type PedidoLigacao = { caminho: string; coluna_id: number; prioridade?: Prioridade; rotulos?: Record<string, string>; secundario?: boolean };
type ColunaQuadro = { id: number; titulo: string; tipo: string; config?: AnyRecord };
// Coluna número ×10 do Friday (config.x10) já guarda o inteiro ×10: com um campo ×10 do contrato, não há conversão.
const escalaEfetiva = (contrato: CampoContrato, col: ColunaQuadro) => (contrato.escala ?? 1) / (col.tipo === 'numero' && col.config?.x10 ? 10 : 1);
const rotulosDaColuna = (col: ColunaQuadro) => ((col.config?.rotulos ?? []) as AnyRecord[]).filter(r => String(r.id) !== '0' && String(r.texto ?? '').trim());

/**
 * Valida as ligações coluna → campo e monta os campos do registro. A coluna-chave (quando não é o nome do item) precisa
 * estar ligada ao campo-chave. Em opções fixas, cada rótulo usado no Friday precisa de uma opção do contrato.
 */
export function montarCamposExistente(cadastro: CadastroExistente, colunas: ColunaQuadro[], pedidos: PedidoLigacao[],
  chave: ChaveConciliacao | null): { campos: CampoExistente[]; erros: string[] } {
  const erros: string[] = [];
  const campos: CampoExistente[] = [];
  const porId = new Map(colunas.map(c => [Number(c.id), c]));
  const caminhos = new Set<string>(), usadas = new Set<number>();
  const livre = `${cadastro.grupo_livre}.`;
  // Sem chave: campos dos subitens (o vínculo de cada subitem vem do item pai).
  if (chave && !cadastro.chaves.includes(chave.caminho)) erros.push(`"${chave.caminho}" não é um campo-chave de ${cadastro.colecao}.`);
  if (chave && chave.coluna_id != null && !pedidos.some(p => p.caminho === chave.caminho && Number(p.coluna_id) === chave.coluna_id)) {
    erros.push('A coluna-chave precisa estar ligada ao campo-chave.');
  }
  for (const p of pedidos) {
    const col = porId.get(Number(p.coluna_id));
    if (!col) { erros.push(`A coluna ${p.coluna_id} não pertence ao quadro.`); continue; }
    if (caminhos.has(p.caminho)) { erros.push(`"${p.caminho}" foi ligado duas vezes.`); continue; }
    if (p.secundario) {
      const contratoSec = cadastro.campos.find(c => c.caminho === p.caminho);
      const principal = pedidos.some(o => o !== p && !o.secundario && Number(o.coluna_id) === col.id);
      if (!contratoSec || contratoSec.tipo !== 'opcao' || contratoSec.opcoes_abertas || col.tipo !== 'status' || !principal) {
        erros.push(`"${col.titulo}" só pode alimentar também um campo de opções fixas quando já está ligada a outro campo.`); continue;
      }
    } else if (usadas.has(col.id)) { erros.push(`A coluna "${col.titulo}" foi ligada duas vezes.`); continue; }
    // Grupo livre: a coluna vira campo oficial com as regras dos cadastros novos.
    if (p.caminho.startsWith(livre)) {
      const sufixo = p.caminho.slice(livre.length);
      if (!chaveValida(sufixo)) { erros.push(`Chave inválida para "${col.titulo}": use minúsculas, números e "_", começando por letra.`); continue; }
      if (sufixo === MARCA_VINCULO) { erros.push(`A chave "${MARCA_VINCULO}" é reservada em "${cadastro.grupo_livre}" (marca dos registros ligados).`); continue; }
      if (!TIPOS_OFICIAIS.has(col.tipo) || col.tipo === 'pessoa') { erros.push(`A coluna "${col.titulo}" (${col.tipo}) ainda não pode ser campo oficial de um cadastro existente.`); continue; }
      const rotulos = col.tipo === 'status' ? rotulosOficiais(col.config?.rotulos) : col.tipo === 'lista' ? rotulosOficiais(col.config?.opcoes) : undefined;
      caminhos.add(p.caminho); usadas.add(col.id);
      campos.push({ chave: p.caminho, titulo: col.titulo, tipo: col.tipo, coluna_id: col.id, situacao: 'ativo', ...(rotulos ? { rotulos } : {}), obrigatorio: false, nulo: true, prioridade: 'quadro' });
      continue;
    }
    const contrato = cadastro.campos.find(c => c.caminho === p.caminho);
    if (!contrato) { erros.push(`"${p.caminho}" não é um campo de ${cadastro.colecao}.`); continue; }
    if (contrato.derivado) { erros.push(`"${contrato.titulo}" é calculado e não é ligado a coluna.`); continue; }
    if (!COLUNAS_COMPATIVEIS[contrato.tipo].includes(col.tipo)) { erros.push(`A coluna "${col.titulo}" (${col.tipo}) não combina com "${contrato.titulo}" (${contrato.tipo}).`); continue; }
    let rotulos: RotuloOficial[] | undefined;
    if (contrato.tipo === 'texto' && col.tipo === 'status') {
      // Rótulo → texto: o cadastro guarda o texto do rótulo.
      rotulos = rotulosDaColuna(col).map(r => ({ codigo: String(r.texto).trim(), texto: String(r.texto).trim(), cor: String(r.cor ?? '#c4c4c4'), friday_id: String(r.id) }));
    } else if (contrato.tipo === 'opcao' && contrato.opcoes_abertas) {
      rotulos = rotulosOficiais(col.config?.rotulos);
    } else if (contrato.tipo === 'opcao') {
      rotulos = [];
      for (const r of rotulosDaColuna(col)) {
        const opcao = p.rotulos?.[String(r.id)];
        if (!opcao) { erros.push(`Escolha a opção de "${contrato.titulo}" para o rótulo "${r.texto}".`); continue; }
        if (!contrato.opcoes?.includes(opcao)) { erros.push(`"${opcao}" não é uma opção de "${contrato.titulo}".`); continue; }
        rotulos.push({ codigo: opcao, texto: String(r.texto).trim(), cor: String(r.cor ?? '#c4c4c4'), friday_id: String(r.id) });
      }
    }
    caminhos.add(p.caminho);
    if (!p.secundario) usadas.add(col.id);
    campos.push({
      chave: contrato.caminho, titulo: p.secundario ? `${contrato.titulo} (de ${col.titulo})` : col.titulo, tipo: col.tipo, coluna_id: col.id, situacao: 'ativo',
      ...(rotulos ? { rotulos } : {}), ...(p.secundario ? { secundario: true } : {}),
      tipo_contrato: contrato.tipo, obrigatorio: contrato.obrigatorio, nulo: contrato.nulo,
      ...(contrato.inteiro ? { inteiro: true } : {}), ...(escalaEfetiva(contrato, col) !== 1 ? { escala: escalaEfetiva(contrato, col) } : {}),
      ...(contrato.somente_leitura ? { somente_leitura: true } : {}), ...(contrato.opcoes_abertas ? { opcoes_abertas: true } : {}),
      ...(contrato.deriva ? { deriva: contrato.deriva } : {}), ...(contrato.exato ? { exato: true } : {}),
      prioridade: contrato.somente_leitura ? 'cadastro' : p.prioridade === 'quadro' ? 'quadro' : 'cadastro',
    });
  }
  if (!campos.length) erros.push('Ligue pelo menos uma coluna a um campo do cadastro.');
  return { campos, erros };
}

const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Campos dos subitens de um cadastro existente (ex.: Status do LOTE → `lotes.{id}.status`), ligados como os do item. */
export function montarCamposSubitens(cadastro: CadastroExistente, colunas: ColunaQuadro[], pedidos: PedidoLigacao[]) {
  if (!cadastro.subitens) return { campos: [] as CampoExistente[], erros: [`${cadastro.colecao} não tem subitens oficiais.`] };
  return montarCamposExistente({ ...cadastro, campos: cadastro.subitens.campos, chaves: [] }, colunas, pedidos, null);
}

/** Resultado da fórmula → campos calculados (ex.: "Obra Finalizada" → situacao e status FINALIZADA). */
/** `ativo = false` (item arquivado ou na lixeira no Friday): o status fica em `sim` qualquer que seja o resultado. */
export function camposDaFormula(cadastro: CadastroExistente, resultado: unknown, ativo = true): [string, unknown][] {
  const f = cadastro.situacao_por_formula;
  if (!f) return [];
  const texto = String(resultado ?? '').trim();
  return [[f.caminho, texto || null], [f.status.caminho, !ativo || texto === f.status.quando ? f.status.sim : f.status.nao]];
}

/**
 * Valor da célula do Friday → valor do documento. `vazio: true` quando a célula não tem valor (o que gravar fica a
 * cargo de quem chama); `erro` quando o valor não cabe no contrato.
 */
export function valorParaContrato(campo: CampoExistente, valor: unknown): { valor?: unknown; vazio?: true; erro?: string } {
  if (!campo.tipo_contrato) {
    const v = valorOficial(campo, valor);
    return v === undefined ? { vazio: true } : { valor: v };
  }
  if (campo.tipo_contrato === 'caixa') return { valor: valor === true || valor === 1 || valor === '1' };
  if (vazio(valor)) return { vazio: true };
  if (campo.tipo === 'status') {
    const r = campo.rotulos?.find(x => x.friday_id === String(valor));
    return r ? { valor: r.codigo } : { erro: `O rótulo escolhido em "${campo.titulo}" não tem opção correspondente no cadastro.` };
  }
  switch (campo.tipo_contrato) {
    case 'texto': return campo.exato ? (String(valor).trim() ? { valor: String(valor) } : { vazio: true }) : { valor: String(valor).trim() };
    case 'data': return /^\d{4}-\d{2}-\d{2}/.test(String(valor)) ? { valor: String(valor).slice(0, 10) } : { erro: `Data inválida em "${campo.titulo}".` };
    case 'numero': {
      let n = Number(valor);
      if (!Number.isFinite(n)) return { erro: `Número inválido em "${campo.titulo}".` };
      if (campo.escala) n = Math.round(n * campo.escala);
      if (campo.inteiro && !Number.isInteger(n)) return { erro: `"${campo.titulo}" precisa ser um número inteiro.` };
      return { valor: n };
    }
    default: return { erro: `Tipo não suportado em "${campo.titulo}".` };
  }
}

/** Campos calculados que acompanham a gravação de um campo (ex.: situacao → ativo). */
export function derivados(campo: CampoExistente, valor: unknown): [string, unknown][] {
  if (!campo.deriva || valor == null) return [];
  return [[campo.deriva.caminho, valor === campo.deriva.verdadeiro_quando]];
}

/** Valor para gravar a partir da tela (com os campos calculados): vazio vira null (se o contrato aceita) ou é recusado. */
export function valorParaGravarExistente(campo: CampoExistente, valor: unknown): { gravar: [string, unknown][] } | { erro: string } {
  if (campo.somente_leitura) return { erro: `"${campo.titulo}" é só leitura: o valor vem do cadastro.` };
  const r = valorParaContrato(campo, valor);
  if (r.erro) return { erro: r.erro };
  if (r.vazio) return campo.nulo ? { gravar: [[campo.chave, null]] } : { erro: `"${campo.titulo}" é obrigatório no cadastro.` };
  return { gravar: [[campo.chave, r.valor], ...derivados(campo, r.valor)] };
}

/**
 * Documento novo do cadastro a partir de um item: fixos + padrões + valores do item (e calculados). Com a chave
 * "começa com" no nome do item, a 1ª palavra vira o identificador e o resto, o nome (se o nome não estiver ligado).
 */
export function novoRegistro(cadastro: CadastroExistente, campos: CampoExistente[], item: ItemConciliavel, chave: ChaveConciliacao) {
  const doc: AnyRecord = structuredClone(cadastro.fixos);
  const erros: string[] = [];
  for (const c of cadastro.campos) if (c.obrigatorio || c.padrao !== undefined) gravarCaminho(doc, c.caminho, c.padrao !== undefined ? c.padrao : c.nulo ? null : undefined);
  if (chave.coluna_id == null) {
    const nome = String(item.nome ?? '').trim();
    if (chave.modo === 'prefixo' && cadastro.dividir_nome) {
      const [primeira, ...resto] = nome.split(/\s+/);
      gravarCaminho(doc, cadastro.dividir_nome.identificador, primeira ?? '');
      if (resto.length) gravarCaminho(doc, cadastro.dividir_nome.resto, resto.join(' '));
    } else gravarCaminho(doc, chave.caminho, nome);
  }
  for (const c of campos) {
    if (c.somente_leitura) continue;
    const r = valorParaContrato(c, item.valores?.[String(c.coluna_id)]);
    if (r.erro) erros.push(r.erro);
    else if (!r.vazio) { gravarCaminho(doc, c.chave, r.valor); for (const [k, v] of derivados(c, r.valor)) gravarCaminho(doc, k, v); }
  }
  for (const c of cadastro.campos) {
    if (!c.obrigatorio) continue;
    const v = lerCaminho(doc, c.caminho);
    if (v === undefined || (!c.nulo && (v === null || (v === '' && c.padrao === undefined)))) erros.push(`"${c.titulo}" é obrigatório para criar o registro.`);
  }
  return { doc, erros };
}

// ---------------------------------------------------------------- plano da conciliação (simulação e execução usam o mesmo)
/**
 * criar: itens sem par que viram registro novo; trazer: registros sem item que entram no quadro; ambiguos: item → registro
 * escolhido; desfazer: casados que não devem ser vinculados; manuais: item → registro livre escolhido à mão (itens sem par,
 * casados desfeitos e ambíguos deixados fora); duplicados: itens ambíguos que são cópia de outro e serão arquivados.
 */
export type Decisoes = {
  criar?: number[]; trazer?: string[]; ambiguos?: Record<string, string>;
  desfazer?: number[]; manuais?: Record<string, string>; duplicados?: number[];
};
export type RelatorioCampo = { caminho: string; titulo: string; iguais: number; preenchidos: number; divergentes: number; mantidos: number; sobrescritos: number; erros: number };
export type Plano = {
  vincular: { itemId: number; registroId: string; gravar: [string, unknown][] }[];
  criar: { itemId: number; doc: AnyRecord }[];
  trazer: { registroId: string; nome: string }[];
  // Valores de texto do cadastro que ainda não são rótulo na coluna (entram como rótulos novos).
  rotulosNovos: { coluna_id: number; chave: string; textos: string[] }[];
  arquivar: number[];      // itens duplicados (arquivados no quadro, restauráveis)
  manuais: number;         // vínculos escolhidos à mão
  desfeitos: number;       // casados desfeitos
  foraDoQuadro: number; deixadosFora: number; ambiguosPendentes: number;
  campos: RelatorioCampo[]; erros: string[];
};

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Plano da conciliação: o que vincular (e o que gravar em cada registro, conforme a prioridade de cada campo), o que
 * criar e o que trazer para o quadro. Itens sem par e não marcados para criar ficam fora; ambíguos sem escolha também.
 */
export function planejar(cadastro: CadastroExistente, campos: CampoExistente[], analise: Analise, itens: ItemConciliavel[],
  registros: RegistroExistente[], decisoes: Decisoes, chave: ChaveConciliacao): Plano {
  const porItem = new Map(itens.map(i => [i.id, i]));
  const porRegistro = new Map(registros.map(r => [r.id, r]));
  const plano: Plano = { vincular: [], criar: [], trazer: [], rotulosNovos: [], arquivar: [], manuais: 0, desfeitos: 0, foraDoQuadro: 0, deixadosFora: 0, ambiguosPendentes: 0, campos: [], erros: [] };
  const rel = new Map(campos.map(c => [c.chave, { caminho: c.chave, titulo: c.titulo, iguais: 0, preenchidos: 0, divergentes: 0, mantidos: 0, sobrescritos: 0, erros: 0 }]));
  const desfazer = new Set(decisoes.desfazer ?? []);
  const duplicados = new Set(decisoes.duplicados ?? []);
  const pares: { itemId: number; registroId: string }[] = [];
  const escolhidos = new Set<string>();
  // Itens e registros que podem ser ligados à mão: sem par, casados desfeitos e ambíguos que ficaram de fora.
  const avulsos = new Set<number>(analise.semPar.map(s => s.itemId));
  const livres = new Set<string>(analise.semItem.map(s => s.registroId));
  for (const c of analise.casados) {
    if (desfazer.has(c.itemId)) { plano.desfeitos++; avulsos.add(c.itemId); livres.add(c.registroId); continue; }
    pares.push({ itemId: c.itemId, registroId: c.registroId }); escolhidos.add(c.registroId);
  }
  for (const a of analise.ambiguos) {
    if (duplicados.has(a.itemId)) { plano.arquivar.push(a.itemId); continue; }
    const escolha = decisoes.ambiguos?.[String(a.itemId)];
    if (escolha && a.registroIds.includes(escolha) && !escolhidos.has(escolha)) { pares.push({ itemId: a.itemId, registroId: escolha }); escolhidos.add(escolha); }
    else { plano.ambiguosPendentes++; avulsos.add(a.itemId); }
  }
  for (const a of analise.ambiguos) for (const id of a.registroIds) if (!escolhidos.has(id)) livres.add(id);
  const ligadosAMao = new Set<number>();
  for (const [k, registroId] of Object.entries(decisoes.manuais ?? {})) {
    const itemId = Number(k);
    if (!avulsos.has(itemId) || !livres.has(registroId) || escolhidos.has(registroId)) {
      plano.erros.push(`Vínculo manual inválido: o item ${porItem.get(itemId)?.nome ?? k} ou o registro já está em uso.`); continue;
    }
    pares.push({ itemId, registroId }); escolhidos.add(registroId); ligadosAMao.add(itemId); plano.manuais++;
    if (analise.ambiguos.some(a => a.itemId === itemId)) plano.ambiguosPendentes--;
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
      // Secundário de opções fixas (ex.: Categoria a partir do Tipo do Veículo): só preenche ou sobrescreve conforme a prioridade.
      if (igual(atual, v.valor)) { r.iguais++; continue; }
      if (atual == null || atual === '') { r.preenchidos++; gravar.push([c.chave, v.valor], ...derivados(c, v.valor)); continue; }
      r.divergentes++;
      if (c.prioridade === 'quadro') { r.sobrescritos++; gravar.push([c.chave, v.valor], ...derivados(c, v.valor)); } else r.mantidos++;
    }
    plano.vincular.push({ itemId, registroId, gravar });
  }
  const criar = new Set(decisoes.criar ?? []);
  plano.deixadosFora += plano.desfeitos - [...desfazer].filter(id => ligadosAMao.has(id)).length;
  for (const s of analise.semPar) {
    if (ligadosAMao.has(s.itemId)) continue;
    if (!criar.has(s.itemId)) { plano.deixadosFora++; continue; }
    const item = porItem.get(s.itemId)!;
    const r = novoRegistro(cadastro, campos, item, chave);
    if (r.erros.length) { plano.erros.push(...r.erros.map(e => `${item.nome}: ${e}`)); plano.deixadosFora++; continue; }
    plano.criar.push({ itemId: s.itemId, doc: r.doc });
  }
  const trazer = new Set(decisoes.trazer ?? []);
  for (const s of analise.semItem) {
    if (escolhidos.has(s.registroId)) continue; // ligado à mão
    if (trazer.has(s.registroId)) plano.trazer.push({ registroId: s.registroId, nome: s.nome || s.chave || s.registroId });
    else plano.foraDoQuadro++;
  }
  // Rótulo → texto: textos do cadastro (vinculados e trazidos) que ainda não são rótulo da coluna.
  const lidos = [...pares.map(p => p.registroId), ...plano.trazer.map(t => t.registroId)].map(id => porRegistro.get(id)!.dados);
  for (const c of campos) {
    if (c.tipo !== 'status' || c.tipo_contrato !== 'texto' || c.secundario) continue;
    const conhecidos = new Set((c.rotulos ?? []).map(r => r.codigo));
    const textos = [...new Set(lidos.map(d => lerCaminho(d, c.chave)).filter((v): v is string => typeof v === 'string' && v.trim() !== '' && !conhecidos.has(v)))];
    if (textos.length) plano.rotulosNovos.push({ coluna_id: c.coluna_id, chave: c.chave, textos });
  }
  plano.campos = [...rel.values()];
  return plano;
}

/** Acrescenta rótulos novos (textos do cadastro) à coluna do Friday e ao campo oficial. Devolve a config e o campo. */
export function acrescentarRotulosDeTexto(config: AnyRecord | undefined, campo: CampoExistente, textos: string[]) {
  const rotulos = [...((config?.rotulos ?? []) as AnyRecord[])];
  const cores = ['#579bfc', '#a25ddc', '#ff642e', '#037f4c', '#9d50dd', '#ffcb00', '#bb3354', '#225091'];
  let proximo = Math.max(0, ...rotulos.map(r => Number(r.id) || 0)) + 1;
  const novosCampo: RotuloOficial[] = [];
  for (const texto of textos) {
    const id = String(proximo++);
    const cor = cores[(Number(id) - 1) % cores.length];
    rotulos.push({ id, texto, cor });
    novosCampo.push({ codigo: texto, texto, cor, friday_id: id });
  }
  return { config: { ...(config ?? {}), rotulos }, campo: { ...campo, rotulos: [...(campo.rotulos ?? []), ...novosCampo] } };
}

// ---------------------------------------------------------------- gravação pelo registro (CronoObra)
/**
 * Quem não lê as coleções do Friday (credencial engenharia, no CronoObra) grava pelo registro oficial: documento e,
 * nos subitens, a chave da entrada (ex.: obras-v2/{id}, LOTE `lotes.{sub}`). Aqui se escolhe o item do Friday
 * vinculado a ele, entre os itens que apontam para o documento, só nos cadastros ativos da coleção.
 */
export function itemDoRegistro(itens: AnyRecord[], chaves: Set<string>, sub: string | null): { item: AnyRecord } | { erro: string } {
  const achados = itens.filter(i => chaves.has(String(i.vinculo?.cadastro)) && String(i.vinculo?.sub ?? '') === String(sub ?? ''));
  if (achados.length === 1) return { item: achados[0] };
  return { erro: achados.length ? 'Mais de um item do Friday ligado a este registro.' : 'Este registro não está ligado a um item do Friday.' };
}

/** Valor da célula a partir do texto do rótulo (o id do rótulo no Friday). Só campos de rótulo. */
export function valorPeloTexto(campo: CampoExistente | undefined, texto: unknown): { valor: string } | { erro: string } {
  if (!campo || campo.situacao !== 'ativo' || campo.secundario) return { erro: 'Este campo não é um campo oficial ativo.' };
  if (campo.tipo !== 'status') return { erro: `"${campo.titulo}" não é um campo de rótulo.` };
  const rotulo = (campo.rotulos ?? []).find(r => r.texto === texto);
  if (!rotulo?.friday_id) return { erro: `"${String(texto)}" não é um valor de "${campo.titulo}".` };
  return { valor: String(rotulo.friday_id) };
}
