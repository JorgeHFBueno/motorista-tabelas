// Regras da Revisão, iguais às da Manutenção do app Flutter (manutencao/manutencao_regras.dart), sem depender de telas.
import { validarMedidor, type ChecklistPendencia } from '../../checklist-mecanico/domain/regras';
import { ACOES, CATEGORIAS, EIXOS, LADOS, UNIDADES, tituloDe, type CategoriaId } from './listas';
import { ehRascunho, estaAberta, exibirDia, horimetroDe, type Dia, type RevisaoItem, type RevisaoRegistro } from './registro';

export type { ChecklistPendencia };

/** Erros das três datas, em relação a hoje. */
export function validarDatas(r: RevisaoRegistro, hoje: Dia): string[] {
  const erros: string[] = [];
  const { dataParada: parada, dataEntrada: entrada, dataRetorno: retorno } = r;
  if (entrada == null) erros.push('Informe a data que foi ao mecânico.');
  else if (entrada > hoje) erros.push('A data que foi ao mecânico não pode ser no futuro.');
  if (parada != null && entrada != null && parada > entrada) erros.push('A data que parou não pode ser depois da data que foi ao mecânico.');
  if (retorno != null) {
    if (retorno > hoje) erros.push('A data que voltou não pode ser no futuro.');
    if (entrada != null && retorno < entrada) erros.push('A data que voltou não pode ser antes da data que foi ao mecânico.');
  }
  return erros;
}

/** O que falta em um item; vazio quando completo. */
export function pendenciasDoItem(item: RevisaoItem): string[] {
  return [
    item.categoria == null && 'Escolha a categoria.',
    item.acao == null && 'Escolha a ação.',
    item.peca.trim() === '' && 'Informe a peça ou o serviço.',
    item.quantidade != null && item.quantidade <= 0 && 'A quantidade precisa ser maior que zero.',
    item.quantidade != null && item.unidade == null && 'Escolha a unidade da quantidade.',
    item.quantidade == null && item.unidade != null && 'Informe a quantidade ou tire a unidade.',
  ].filter((p): p is string => typeof p === 'string');
}

const FECHAR_SEM_ITEM = 'Inclua ao menos um item para fechar a revisão.';

/** O que impede salvar; com a data que voltou, salvar fecha o registro e exige ao menos um item. */
export function pendenciasAoSalvar(r: RevisaoRegistro, hoje: Dia): ChecklistPendencia[] {
  const resultado: ChecklistPendencia[] = [];
  const erroMedidor = validarMedidor(r.medidor, { ultimo: r.veiculo.medidorUltimo, horimetro: horimetroDe(r.veiculo), corrigido: r.medidorCorrigido });
  if (erroMedidor) resultado.push({ mensagem: erroMedidor, itemId: null });
  if (r.tipo == null) resultado.push({ mensagem: 'Escolha Preventiva ou Corretiva.', itemId: null });
  if (r.motivo.trim() === '') resultado.push({ mensagem: 'Informe o motivo.', itemId: null });
  for (const erro of validarDatas(r, hoje)) resultado.push({ mensagem: erro, itemId: null });
  for (const item of r.itens) {
    for (const erro of pendenciasDoItem(item)) resultado.push({ mensagem: erro, itemId: item.itemId });
  }
  if (r.dataRetorno != null && r.itens.length === 0) resultado.push({ mensagem: FECHAR_SEM_ITEM, itemId: null });
  return resultado;
}

/** O que impediria fechar com a data que voltou em `retorno` (hoje, antes de escolher a data). */
export const pendenciasParaFechar = (r: RevisaoRegistro, hoje: Dia, retorno: Dia = hoje) =>
  pendenciasAoSalvar({ ...r, dataRetorno: retorno }, hoje);

const paraBusca = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLocaleLowerCase('pt-BR');

/** Motivo que vale para o item: o próprio, ou o geral do registro. */
export const motivoDoItem = (r: RevisaoRegistro, item: RevisaoItem) => {
  const proprio = item.motivo?.trim() ?? '';
  return proprio === '' ? r.motivo.trim() : proprio;
};

/** Grava o motivo do item; vazio ou igual ao geral volta a usar o geral (null), para acompanhá-lo se ele mudar. */
export function comMotivo(item: RevisaoItem, texto: string, r: RevisaoRegistro): RevisaoItem {
  const motivo = texto.trim();
  return { ...item, motivo: motivo === '' || paraBusca(motivo) === paraBusca(r.motivo) ? null : motivo };
}

/**
 * Sugestões de peça/serviço para o que foi digitado: primeiro as da categoria, depois as já digitadas em outros
 * registros dela. Sem repetir nem diferenciar acento e maiúscula, e sem sugerir exatamente o que já está escrito.
 */
export function sugestoesDePeca(categoria: CategoriaId | null, texto = '', anteriores: readonly string[] = [], limite = 8): string[] {
  const busca = paraBusca(texto);
  const vistas = new Set<string>();
  const resultado: string[] = [];
  const daCategoria = CATEGORIAS.find((c) => c.id === categoria)?.sugestoes ?? [];
  for (const opcao of [...daCategoria, ...anteriores]) {
    const normalizada = paraBusca(opcao);
    if (normalizada === '' || normalizada === busca || !normalizada.includes(busca) || vistas.has(normalizada)) continue;
    vistas.add(normalizada);
    resultado.push(opcao.trim());
    if (resultado.length === limite) break;
  }
  return resultado;
}

/** Peças já digitadas nos registros, por categoria (para as sugestões). */
export function pecasAnteriores(registros: Iterable<RevisaoRegistro>): Partial<Record<CategoriaId, string[]>> {
  const resultado: Partial<Record<CategoriaId, string[]>> = {};
  for (const r of registros) {
    for (const item of r.itens) {
      if (item.categoria == null || item.peca.trim() === '') continue;
      (resultado[item.categoria] ??= []).push(item.peca.trim());
    }
  }
  return resultado;
}

/** Inteiro sem casas; fração com vírgula ("2", "1,5"). */
export const textoNumero = (valor: number) => String(valor).replace('.', ',');

/** Uma linha para listas: "Freios · Trocado · lona de freio · Dianteiro LD · 2 un". */
export function resumoDoItem(item: RevisaoItem): string {
  const posicao = [tituloDe(EIXOS, item.eixo), tituloDe(LADOS, item.lado)].filter(Boolean).join(' ');
  const quantidade = item.quantidade == null ? '' : `${textoNumero(item.quantidade)} ${tituloDe(UNIDADES, item.unidade) ?? ''}`.trim();
  return [tituloDe(CATEGORIAS, item.categoria), tituloDe(ACOES, item.acao), item.peca.trim(), posicao, quantidade]
    .filter((parte): parte is string => Boolean(parte))
    .join(' · ');
}

/** Registros abertos do veículo, do mais antigo para o mais novo (um veículo pode ter mais de um aberto). */
export function abertosDoVeiculo(registros: Iterable<RevisaoRegistro>, veiculoId: string): RevisaoRegistro[] {
  return [...registros]
    .filter((r) => estaAberta(r) && r.veiculo.id === veiculoId)
    .sort((a, b) => (a.dataEntrada ?? '').localeCompare(b.dataEntrada ?? '') || a.abertaEm.getTime() - b.abertaEm.getTime());
}

/** Versão a editar de um registro aberto: a do aparelho quando é da mesma revisão ou mais nova; senão, a do servidor. */
export const versaoParaEditar = (local: RevisaoRegistro | null, servidor: RevisaoRegistro): RevisaoRegistro =>
  local != null && local.revisao >= servidor.revisao ? local : servidor;

/** Registros do aparelho mais os abertos do servidor que faltam ou estão mais novos lá. */
export function juntarComServidor(locais: readonly RevisaoRegistro[], servidor: readonly RevisaoRegistro[]): RevisaoRegistro[] {
  const porId = new Map(locais.map((r) => [r.id, r]));
  for (const remoto of servidor) porId.set(remoto.id, versaoParaEditar(porId.get(remoto.id) ?? null, remoto));
  return [...porId.values()].sort((a, b) => a.abertaEm.getTime() - b.abertaEm.getTime());
}

/** Ordem do histórico: abertos primeiro; depois, do que foi ao mecânico por último para o mais antigo. */
export function ordenarHistorico<T extends { registro: RevisaoRegistro }>(lidas: Iterable<T>): T[] {
  return [...lidas].sort((a, b) => {
    const aberta = Number(estaAberta(b.registro)) - Number(estaAberta(a.registro));
    if (aberta !== 0) return aberta;
    const ea = a.registro.dataEntrada;
    const eb = b.registro.dataEntrada;
    if (ea != null && eb != null && ea !== eb) return eb.localeCompare(ea);
    return b.registro.abertaEm.getTime() - a.registro.abertaEm.getTime();
  });
}

export const textoItens = (n: number) => (n === 1 ? '1 item' : `${n} itens`);
export const textoFotos = (n: number) => (n === 1 ? '1 foto' : `${n} fotos`);

/** "Desde 19/11/2026 · 2 itens · motivo", como no app. */
export const descricaoRegistro = (r: RevisaoRegistro) => [
  r.dataEntrada ? `Desde ${exibirDia(r.dataEntrada)}` : null,
  textoItens(r.itens.length),
  r.motivo.trim() || null,
  !ehRascunho(r) && r.alterado ? 'alterações não salvas' : null,
].filter(Boolean).join(' · ');

/** "19/11/2026 → 21/11/2026", ou "Desde 19/11/2026" enquanto aberto. */
export const textoDatas = (r: RevisaoRegistro) => {
  const entrada = r.dataEntrada ? exibirDia(r.dataEntrada) : '-';
  return r.dataRetorno ? `${entrada} → ${exibirDia(r.dataRetorno)}` : `Desde ${entrada}`;
};
