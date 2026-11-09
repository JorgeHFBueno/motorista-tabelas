// Normalização de KM/horímetro do detalhe do veículo (/frota/veiculos/:id), portada da ferramenta local
// normalizacao-km-v2. O sistema só aponta leituras suspeitas; quem decide o valor certo é a pessoa.

export type ColecaoKm = 'atividades' | '03-combustivel' | 'veiculos-v2';
export type CampoKm = 'km' | 'quilometragem' | 'horimetro' | 'operacional.quilometragemUltima';

/** Uma leitura do medidor guardada num registro. `key` = "<coleção>/<id>#<campo>". */
export type LeituraKm = {
  key: string;
  collection: 'atividades' | '03-combustivel';
  documentId: string;
  field: 'km' | 'quilometragem' | 'horimetro';
  data: Date | null;
  valorBruto: unknown;
  /** O valor guardado, quando é um número finito. */
  valor: number | null;
  rotulo: string;
};

export type AlertaKm =
  | { codigo: 'MAIS_DIGITOS_QUE_REFERENCIA'; digitosValor: number; digitosReferencia: number }
  | { codigo: 'RETROCESSO_LOCAL' }
  | { codigo: 'SUGESTAO_MULTIPLICAR'; multiplicador: number; valor: number };

export type LeituraAnalisada = LeituraKm & {
  alertas: AlertaKm[];
  suspeito: boolean;
  /** Vizinhos usados no retrocesso (o anterior e o próximo com outro horário). */
  anterior: number | null;
  posterior: number | null;
};

export type AlteracaoKm = {
  key: string;
  collection: ColecaoKm;
  documentId: string;
  field: CampoKm;
  valorOriginal: number;
  valorNovo: number;
};

export const TOLERANCIA_RETROCESSO = 1;
export const MULTIPLICADORES = [10, 100, 1000];
export const MAX_ALTERACOES_POR_LOTE = 400;
export const CAMPOS_PERMITIDOS: Record<ColecaoKm, readonly CampoKm[]> = {
  atividades: ['km'],
  '03-combustivel': ['quilometragem', 'horimetro'],
  'veiculos-v2': ['operacional.quilometragemUltima'],
};

export const chaveKm = (collection: string, documentId: string, field: string) => `${collection}/${documentId}#${field}`;

const map = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const numeroFinito = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inteiroValido = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function paraData(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (raw && typeof (raw as { toDate?: () => Date }).toDate === 'function') return (raw as { toDate: () => Date }).toDate();
  if (raw && typeof raw === 'object' && typeof (raw as { seconds?: unknown }).seconds === 'number') {
    const { seconds, nanoseconds } = raw as { seconds: number; nanoseconds?: number };
    return new Date(seconds * 1000 + (nanoseconds ?? 0) / 1e6);
  }
  return null;
}

/** Valor de um caminho com pontos ("operacional.quilometragemUltima"). */
export function valorNoCaminho(data: unknown, caminho: string): unknown {
  return caminho.split('.').reduce<unknown>((atual, parte) => (atual == null ? undefined : map(atual)[parte]), data);
}

function leitura(collection: LeituraKm['collection'], documentId: string, field: LeituraKm['field'], raw: Record<string, unknown>, rotulo: string): LeituraKm[] {
  const valorBruto = raw[field];
  if (valorBruto === undefined || valorBruto === null) return [];
  return [{ key: chaveKm(collection, documentId, field), collection, documentId, field, data: paraData(raw.data), valorBruto, valor: numeroFinito(valorBruto), rotulo }];
}

/** Saída/Chegada (atividades.md): o odômetro em `km`. */
export function leiturasDeAtividade(documentId: string, raw: Record<string, unknown>): LeituraKm[] {
  const tipo = raw.tipo === 'saida' ? 'Saída' : raw.tipo === 'chegada' ? 'Chegada' : 'Atividade';
  const motorista = texto(map(raw.motorista).nome);
  return leitura('atividades', documentId, 'km', raw, motorista ? `${tipo} — ${motorista}` : tipo);
}

/** Saída de combustível V2: `quilometragem` no PLACA, `horimetro` no EXTRA (veiculos-v2.md). */
export function leiturasDeCombustivel(documentId: string, raw: Record<string, unknown>, medidor: 'km' | 'h'): LeituraKm[] {
  const motivo = texto(raw.motivo);
  return leitura('03-combustivel', documentId, medidor === 'km' ? 'quilometragem' : 'horimetro', raw, motivo ? `Abastecimento — ${motivo}` : 'Abastecimento');
}

function compararLeituras(a: LeituraKm, b: LeituraKm): number {
  const am = a.data?.getTime() ?? Number.POSITIVE_INFINITY;
  const bm = b.data?.getTime() ?? Number.POSITIVE_INFINITY;
  return am - bm || a.collection.localeCompare(b.collection) || a.documentId.localeCompare(b.documentId) || a.field.localeCompare(b.field);
}

/** Linha do tempo (com data, da mais antiga para a mais nova) e as leituras sem data, que ficam fora da análise. */
export function montarLinhaDoTempo(leituras: LeituraKm[]): { linha: LeituraKm[]; semData: LeituraKm[] } {
  return {
    linha: leituras.filter((l) => l.data).sort(compararLeituras),
    semData: leituras.filter((l) => !l.data),
  };
}

const digitos = (valor: number) => String(valor).length;
const mesmoMomento = (a: LeituraKm, b: LeituraKm) => Boolean(a.data && b.data && a.data.getTime() === b.data.getTime());
const temDigitosAMais = (l?: LeituraAnalisada) => Boolean(l?.alertas.some((a) => a.codigo === 'MAIS_DIGITOS_QUE_REFERENCIA'));

function vizinho(linha: LeituraAnalisada[], indice: number, direcao: 1 | -1): LeituraAnalisada | undefined {
  for (let i = indice + direcao; i >= 0 && i < linha.length; i += direcao) if (!mesmoMomento(linha[i], linha[indice])) return linha[i];
  return undefined;
}

/**
 * Alertas locais, como na ferramenta: (1) mais dígitos que o KM de referência; (2) retrocesso — menor que o anterior
 * e o próximo além da tolerância, sem usar vizinho com dígitos a mais — com as multiplicações (×10, ×100, ×1000) que
 * caberiam entre os dois vizinhos. Leituras no mesmo horário não se comparam. Nada é preenchido aqui.
 */
export function analisarLeituras(linha: LeituraKm[], { kmReferencia = null, tolerancia = TOLERANCIA_RETROCESSO }: { kmReferencia?: number | null; tolerancia?: number } = {}): LeituraAnalisada[] {
  const resultado: LeituraAnalisada[] = linha.map((l) => ({ ...l, alertas: [], suspeito: false, anterior: null, posterior: null }));
  const digitosReferencia = inteiroValido(kmReferencia) ? digitos(kmReferencia) : null;

  resultado.forEach((l) => {
    if (digitosReferencia !== null && inteiroValido(l.valor) && digitos(l.valor) > digitosReferencia) {
      l.alertas.push({ codigo: 'MAIS_DIGITOS_QUE_REFERENCIA', digitosValor: digitos(l.valor), digitosReferencia });
    }
  });

  resultado.forEach((l, i) => {
    const antes = vizinho(resultado, i, -1);
    const depois = vizinho(resultado, i, 1);
    const a = antes?.valor ?? null;
    const p = depois?.valor ?? null;
    l.anterior = a;
    l.posterior = p;
    const atual = l.valor;
    // Inclusivo no limite: 12, 11, 13 com tolerância 1 é retrocesso.
    const retrocesso = atual !== null && a !== null && p !== null && atual <= a - tolerancia && atual <= p - tolerancia;
    if (retrocesso && !temDigitosAMais(antes) && !temDigitosAMais(l) && !temDigitosAMais(depois)) {
      l.alertas.push({ codigo: 'RETROCESSO_LOCAL' });
      for (const multiplicador of MULTIPLICADORES) {
        const valor = atual * multiplicador;
        if (Number.isFinite(valor) && valor >= a && valor <= p) l.alertas.push({ codigo: 'SUGESTAO_MULTIPLICAR', multiplicador, valor });
      }
    }
    l.suspeito = l.alertas.length > 0;
  });
  return resultado;
}

/** Com dígitos a mais, sugere tirar exatamente os excedentes da direita (sem arredondar). Só sugere: não prepara. */
export function sugestaoPorDigitos(l: Pick<LeituraAnalisada, 'valor' | 'alertas'>): number | null {
  const alerta = l.alertas.find((a) => a.codigo === 'MAIS_DIGITOS_QUE_REFERENCIA');
  if (!alerta || alerta.codigo !== 'MAIS_DIGITOS_QUE_REFERENCIA' || !inteiroValido(l.valor)) return null;
  const bruto = String(l.valor);
  const excesso = alerta.digitosValor - alerta.digitosReferencia;
  if (excesso <= 0 || excesso >= bruto.length) return null;
  const valor = Number(bruto.slice(0, -excesso));
  return Number.isSafeInteger(valor) ? valor : null;
}

/** A linha do tempo com os valores das alterações preparadas (o `valorBruto` continua o guardado), para a análise
 * mostrar só o que falta conferir: o que já foi corrigido deixa de ser sinalizado e os vizinhos voltam a ser comparados. */
export function comAlteracoes(linha: LeituraKm[], alteracoes: ReadonlyMap<string, AlteracaoKm>): LeituraKm[] {
  return linha.map((l) => {
    const preparada = alteracoes.get(l.key);
    return preparada ? { ...l, valor: preparada.valorNovo } : l;
  });
}

/** Referência padrão para os dígitos: a mediana das leituras inteiras, que poucas leituras erradas não movem (o KM
 * último pode ser justamente o valor inflado). Sem leituras, null. */
export function referenciaPadrao(leituras: LeituraKm[]): number | null {
  const valores = leituras.map((l) => l.valor).filter(inteiroValido).sort((a, b) => a - b);
  return valores.length ? valores[Math.floor((valores.length - 1) / 2)] : null;
}

/** Última leitura da linha do tempo, já com as alterações preparadas. */
export function ultimaLeitura(linha: LeituraKm[], alteracoes: ReadonlyMap<string, AlteracaoKm>): number | null {
  for (let i = linha.length - 1; i >= 0; i -= 1) {
    const valor = alteracoes.get(linha[i].key)?.valorNovo ?? linha[i].valor;
    if (valor !== null) return valor;
  }
  return null;
}

/** O KM último do cadastro maior que a última leitura (o app só sobe esse valor): sugere a última leitura. */
export function sugestaoKmUltimo(kmUltimo: number | null, linha: LeituraKm[], alteracoes: ReadonlyMap<string, AlteracaoKm>): number | null {
  const ultima = ultimaLeitura(linha, alteracoes);
  return kmUltimo !== null && ultima !== null && inteiroValido(ultima) && kmUltimo > ultima ? ultima : null;
}

/** Texto do campo "Novo KM": inteiro sem sinal. */
export function lerNovoKm(raw: string): { ok: true; valor: number } | { ok: false; erro: string } {
  const limpo = raw.trim();
  if (!/^\d+$/.test(limpo)) return { ok: false, erro: 'Informe um inteiro maior ou igual a zero.' };
  const valor = Number(limpo);
  return Number.isSafeInteger(valor) ? { ok: true, valor } : { ok: false, erro: 'Número grande demais.' };
}

// ---------------------------------------------------------------- aplicação

export type CodigoErroKm =
  | 'NENHUMA_ALTERACAO' | 'LIMITE_EXCEDIDO' | 'ALTERACAO_DUPLICADA' | 'CAMPO_NAO_PERMITIDO' | 'KEY_DIVERGENTE' | 'VALOR_INVALIDO'
  | 'DOCUMENTO_NAO_ENCONTRADO' | 'DOCUMENTO_DE_OUTRO_VEICULO' | 'VALOR_ALTERADO_DESDE_ANALISE' | 'ESTADO_MISTO' | 'POS_VALIDACAO_FALHOU';

export class ErroNormalizacaoKm extends Error {
  readonly codigo: CodigoErroKm;
  constructor(codigo: CodigoErroKm, mensagem: string) {
    super(mensagem);
    this.name = 'ErroNormalizacaoKm';
    this.codigo = codigo;
  }
}

export type DocumentoKm = Record<string, unknown> | null;
export type TransacaoKm = {
  get: (collection: ColecaoKm, documentId: string) => Promise<DocumentoKm>;
  update: (collection: ColecaoKm, documentId: string, campos: Record<string, number>) => void;
};

function validarAlteracao(a: AlteracaoKm) {
  if (!(CAMPOS_PERMITIDOS[a.collection] ?? []).includes(a.field)) throw new ErroNormalizacaoKm('CAMPO_NAO_PERMITIDO', `Campo não permitido: ${a.collection}.${a.field}.`);
  if (!a.documentId || a.documentId.includes('/') || a.key !== chaveKm(a.collection, a.documentId, a.field)) throw new ErroNormalizacaoKm('KEY_DIVERGENTE', `Alteração inconsistente: ${a.key}.`);
  if (numeroFinito(a.valorOriginal) === null || !inteiroValido(a.valorNovo) || a.valorNovo === a.valorOriginal) throw new ErroNormalizacaoKm('VALOR_INVALIDO', `Valores inválidos em ${a.key}.`);
}

function agrupar(alteracoes: AlteracaoKm[]) {
  const grupos = new Map<string, { collection: ColecaoKm; documentId: string; itens: AlteracaoKm[] }>();
  for (const a of alteracoes) {
    const id = `${a.collection}/${a.documentId}`;
    if (!grupos.has(id)) grupos.set(id, { collection: a.collection, documentId: a.documentId, itens: [] });
    grupos.get(id)!.itens.push(a);
  }
  return [...grupos.values()];
}

/** O documento é do veículo: o próprio cadastro ou um registro com o `item_frota_id` dele. */
const doVeiculo = (collection: ColecaoKm, documentId: string, data: Record<string, unknown>, veiculoId: string) =>
  collection === 'veiculos-v2' ? documentId === veiculoId : data.item_frota_id === veiculoId;

/**
 * Aplica o lote numa transação só: relê todos os documentos, confere que são do veículo e que cada campo ainda tem o
 * valor original (compare-and-set) e só então grava, um update por documento. Se tudo já tem o valor novo (resposta
 * perdida numa tentativa anterior), não grava de novo. Depois do commit, relê e confere os valores novos.
 */
export async function aplicarAlteracoesKm({ veiculoId, alteracoes, executarTransacao, lerDocumento }: {
  veiculoId: string;
  alteracoes: AlteracaoKm[];
  executarTransacao: <T>(trabalho: (t: TransacaoKm) => Promise<T>) => Promise<T>;
  lerDocumento: (collection: ColecaoKm, documentId: string) => Promise<DocumentoKm>;
}): Promise<{ alteracoes: number; documentos: number; reconciliado: boolean }> {
  if (!alteracoes.length) throw new ErroNormalizacaoKm('NENHUMA_ALTERACAO', 'Nenhuma alteração preparada.');
  if (alteracoes.length > MAX_ALTERACOES_POR_LOTE) throw new ErroNormalizacaoKm('LIMITE_EXCEDIDO', `O lote passa de ${MAX_ALTERACOES_POR_LOTE} alterações.`);
  const keys = new Set<string>();
  for (const a of alteracoes) {
    validarAlteracao(a);
    if (keys.has(a.key)) throw new ErroNormalizacaoKm('ALTERACAO_DUPLICADA', `Alteração repetida: ${a.key}.`);
    keys.add(a.key);
  }
  const grupos = agrupar(alteracoes);

  const reconciliado = await executarTransacao(async (t) => {
    const docs = new Map<string, Record<string, unknown>>();
    for (const g of grupos) {
      const data = await t.get(g.collection, g.documentId);
      if (!data) throw new ErroNormalizacaoKm('DOCUMENTO_NAO_ENCONTRADO', `Registro não encontrado: ${g.collection}/${g.documentId}.`);
      if (!doVeiculo(g.collection, g.documentId, data, veiculoId)) throw new ErroNormalizacaoKm('DOCUMENTO_DE_OUTRO_VEICULO', `Registro de outro veículo: ${g.collection}/${g.documentId}.`);
      docs.set(`${g.collection}/${g.documentId}`, data);
    }
    let originais = 0;
    let novos = 0;
    for (const a of alteracoes) {
      const atual = valorNoCaminho(docs.get(`${a.collection}/${a.documentId}`), a.field);
      if (atual === a.valorOriginal) originais += 1;
      else if (atual === a.valorNovo) novos += 1;
    }
    if (novos === alteracoes.length) return true;
    if (originais + novos < alteracoes.length) throw new ErroNormalizacaoKm('VALOR_ALTERADO_DESDE_ANALISE', 'Um registro mudou desde a análise; feche e abra de novo.');
    if (novos > 0) throw new ErroNormalizacaoKm('ESTADO_MISTO', 'Parte do lote já está gravada; feche e abra de novo.');
    for (const g of grupos) t.update(g.collection, g.documentId, Object.fromEntries(g.itens.map((a) => [a.field, a.valorNovo])));
    return false;
  });

  for (const g of grupos) {
    const data = await lerDocumento(g.collection, g.documentId);
    const divergente = g.itens.find((a) => valorNoCaminho(data, a.field) !== a.valorNovo);
    if (divergente) throw new ErroNormalizacaoKm('POS_VALIDACAO_FALHOU', `Depois de gravar, ${divergente.key} não tem o valor novo.`);
  }
  return { alteracoes: alteracoes.length, documentos: grupos.length, reconciliado };
}
