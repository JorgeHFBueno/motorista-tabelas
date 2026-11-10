/**
 * Etiquetas de status (como os rótulos de status do Friday): a lista é editável e fica em logistica-config/status.
 * A programação grava o `id` da etiqueta; '' é sem status. Valores de antes das etiquetas editáveis guardam o nome
 * (resolvido pelo nome) ou um texto livre (aparece em cinza até alguém escolher uma etiqueta).
 */
export interface EtiquetaStatus { id: string; nome: string; cor: string }

/** As do quadro logístico do Monday, enquanto ninguém salvou outra lista. */
export const ETIQUETAS_PADRAO: readonly EtiquetaStatus[] = [
  { id: '1', nome: 'Em viagem', cor: '#fdbc64' },
  { id: '2', nome: 'Ag. NF', cor: '#ff7bd0' },
  { id: '3', nome: 'Carregar', cor: '#2b76e5' },
  { id: '4', nome: 'Finalizado', cor: '#33d391' },
  { id: '5', nome: 'Trabalhando', cor: '#cab641' },
  { id: '6', nome: 'Ag. Conf. Acesso', cor: '#ff8b8b' },
  { id: '7', nome: 'Parado', cor: '#e2445c' },
  { id: '8', nome: 'Lançar item ERP', cor: '#ff7f50' },
  { id: '9', nome: 'AG. Produção', cor: '#175a63' },
  { id: '10', nome: 'CANCELADO', cor: '#c4587a' },
  { id: '11', nome: 'Ag. Conf. Cliente', cor: '#ffcb00' },
  { id: '12', nome: 'Carregando', cor: '#2d9fd6' },
  { id: '13', nome: 'Em Manutenção', cor: '#5c5c5c' },
  { id: '14', nome: 'Ag. Lista de Materiais', cor: '#a25ddc' },
  { id: '15', nome: 'AJUSTE ADM', cor: '#b8a3f5' },
];

export const MAX_ETIQUETAS = 40;
export const COR_SEM_STATUS = '#797e93';

/** Cores para escolher no editor: as do Monday e as do Friday. */
export const CORES_ETIQUETA = [
  '#fdbc64', '#ff7bd0', '#2b76e5', '#33d391', '#cab641', '#ff8b8b', '#e2445c', '#ff7f50', '#175a63', '#c4587a',
  '#ffcb00', '#2d9fd6', '#5c5c5c', '#a25ddc', '#b8a3f5', '#00a36c', '#fdab3d', '#579bfc', '#037f4c', '#9cd326',
  '#0086c0', '#66ccff', '#bb3354', '#ff158a', '#784bd1', '#7f5347', '#c4c4c4', '#333333',
];

/** Texto escuro sobre fundo claro (o mesmo critério do Friday). */
export function textoEscuro(cor: string): boolean {
  const hex = cor.replace('#', '');
  if (hex.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 175;
}

export interface StatusExibido { nome: string; cor: string; etiqueta: EtiquetaStatus | null }

/** O que a célula mostra: a etiqueta pelo id, a de mesmo nome (valor de antes) ou o texto em cinza. */
export function statusExibido(valor: string, etiquetas: readonly EtiquetaStatus[]): StatusExibido {
  const etiqueta = etiquetas.find((item) => item.id === valor) ?? etiquetas.find((item) => valor !== '' && item.nome === valor) ?? null;
  return etiqueta ? { nome: etiqueta.nome, cor: etiqueta.cor, etiqueta } : { nome: valor, cor: COR_SEM_STATUS, etiqueta: null };
}

export function novoIdEtiqueta(etiquetas: readonly EtiquetaStatus[]): string {
  return String(Math.max(0, ...etiquetas.map((item) => Number(item.id) || 0)) + 1);
}

/** Lista válida para gravar: nomes aparados e não vazios, sem repetir id nem nome. */
export function etiquetasLimpas(etiquetas: readonly EtiquetaStatus[]): EtiquetaStatus[] {
  const ids = new Set<string>();
  const nomes = new Set<string>();
  const limpas: EtiquetaStatus[] = [];
  for (const etiqueta of etiquetas) {
    const nome = etiqueta.nome.trim().slice(0, 60);
    const chave = nome.toLocaleLowerCase('pt-BR');
    if (!nome || ids.has(etiqueta.id) || nomes.has(chave)) continue;
    ids.add(etiqueta.id);
    nomes.add(chave);
    limpas.push({ id: etiqueta.id, nome, cor: etiqueta.cor });
  }
  return limpas.slice(0, MAX_ETIQUETAS);
}

/**
 * Ao salvar a lista, as programações acompanham: a que aponta para uma etiqueta excluída fica sem status, e a que
 * ainda guarda o nome de uma etiqueta (valor de antes) passa a guardar o id, para não se perder num renomear.
 */
export function statusAoSalvarEtiquetas(
  programacoes: readonly { id: string; status: string }[],
  antes: readonly EtiquetaStatus[],
  depois: readonly EtiquetaStatus[],
): { id: string; status: string }[] {
  const idsDepois = new Set(depois.map((etiqueta) => etiqueta.id));
  const mudancas: { id: string; status: string }[] = [];
  for (const programacao of programacoes) {
    if (!programacao.status) continue;
    const pelaId = antes.find((etiqueta) => etiqueta.id === programacao.status) ?? depois.find((etiqueta) => etiqueta.id === programacao.status);
    if (pelaId) {
      if (!idsDepois.has(pelaId.id)) mudancas.push({ id: programacao.id, status: '' });
      continue;
    }
    const peloNome = antes.find((etiqueta) => etiqueta.nome === programacao.status);
    if (peloNome) mudancas.push({ id: programacao.id, status: idsDepois.has(peloNome.id) ? peloNome.id : '' });
  }
  return mudancas;
}
