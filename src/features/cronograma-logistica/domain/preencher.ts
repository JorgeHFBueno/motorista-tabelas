// Ajudas de preenchimento do Quadro: o detalhe do veículo na lista, os itens já escritos e a cópia de uma linha.
// Contrato: The Manuscript, 03_APLICACAO_WEB/15_LOGISTICA.md.
import type { Programacao, ProgramacaoEditavel } from './models';

/** Id do <datalist> com os textos já escritos na coluna Item (a página o desenha uma vez). */
export const LISTA_ITENS = 'lg-itens-usados';

const registro = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};

/** Capacidade de veiculos-v2 (gravada ×10) como na Frota: "12", "8,5"; vazio sem número. */
const escala10 = (valor: unknown) =>
  typeof valor === 'number' && Number.isFinite(valor) ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(valor / 10) : '';

/**
 * Detalhe do veículo embaixo do nome, na lista da coluna Veículos: "empresa | Carga x | Munck y", de
 * cadastro.empresa, capacidades.cargaLiquida e capacidades.munck do documento de veiculos-v2; sem o que faltar.
 */
export function detalheDoVeiculo(documento: Record<string, unknown>): string {
  const cadastro = registro(documento.cadastro);
  const capacidades = registro(documento.capacidades);
  const empresa = typeof cadastro.empresa === 'string' ? cadastro.empresa.trim() : '';
  const carga = escala10(capacidades.cargaLiquida);
  const munck = escala10(capacidades.munck);
  return [empresa, carga && `Carga ${carga}`, munck && `Munck ${munck}`].filter(Boolean).join(' | ');
}

/**
 * Os textos já escritos na coluna Item, sem repetir (sem diferença de maiúsculas e espaços nas pontas, vale a grafia
 * mais usada) e do mais usado para o menos usado: sugestões para escrever igual.
 */
export function itensUsados(programacoes: readonly Pick<Programacao, 'item'>[]): string[] {
  const grupos = new Map<string, Map<string, number>>();
  for (const { item } of programacoes) {
    const texto = item.trim().replace(/\s+/g, ' ');
    if (!texto) continue;
    const chave = texto.toLocaleLowerCase('pt-BR');
    const grafias = grupos.get(chave) ?? new Map<string, number>();
    grafias.set(texto, (grafias.get(texto) ?? 0) + 1);
    grupos.set(chave, grafias);
  }
  return [...grupos.values()]
    .map((grafias) => {
      const [texto] = [...grafias.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0];
      return { texto, usos: [...grafias.values()].reduce((soma, n) => soma + n, 0) };
    })
    .sort((a, b) => b.usos - a.usos || a.texto.localeCompare(b.texto, 'pt-BR'))
    .map(({ texto }) => texto);
}

/**
 * O que a cópia de uma linha leva, em partes (cada uma uma gravação: a linha inteira numa gravação só passa do limite
 * de 1000 expressões das Rules): período, pessoas e obra; veículos; local. O item vai na criação. Não leva status (o
 * status copiado repetiria os avisos de Ag. NF e Ag. Lista de Materiais), expedição, nota (PDFs), adiamento nem
 * conflitos ignorados: com as mesmas pessoas e veículos no mesmo período, a cópia nasce em conflito com a original, o
 * que mostra que ela foi duplicada. Partes vazias ficam de fora.
 */
export function partesDaCopia(programacao: Programacao): Partial<ProgramacaoEditavel>[] {
  const { inicio, fim, motorista, auxiliar, obra, veiculos, local } = programacao;
  const basicos = Object.fromEntries(Object.entries({ inicio, fim, motorista, auxiliar, obra }).filter(([, valor]) => valor !== null));
  return [
    basicos,
    veiculos.length ? { veiculos } : {},
    local ? { local } : {},
  ].filter((parte) => Object.keys(parte).length > 0);
}
