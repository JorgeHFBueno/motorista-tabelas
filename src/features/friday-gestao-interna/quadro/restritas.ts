// Colunas restritas (2026-11-23): friday-colunas/{id}.restrita = { ver: [uids] }. Só quem está na lista (e adm2) vê e
// edita a coluna; os valores ficam fora do item, em friday-restritos/{colunaId} = { valores: { itemId: valor } }, com
// Rules próprias. Para os demais a coluna não existe: nem cabeçalho, nem célula, nem a fórmula que depende dela.
// Mesmas regras nas Functions (functions/fridayRestritas.ts), para a API por chave e as automações.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md ("Colunas restritas").

export type ColunaComRestricao = { id: number; tipo: string; config?: Record<string, unknown> | null; restrita?: { ver?: string[] } | null };

/**
 * Tipos que podem ser restritos: os valores passam todos pela gravação de célula (não tempo, pessoa, arquivos, conexão).
 * Fórmula não guarda valor (é calculada na tela): restringir só a esconde de quem não está na lista.
 */
export const TIPOS_RESTRINGIVEIS = new Set(['texto', 'texto_longo', 'numero', 'status', 'lista', 'data', 'periodo', 'link', 'caixa', 'telefone', 'email', 'avaliacao', 'formula']);

/** Colunas livres (não restritas) usadas por uma fórmula: quem as vê consegue chegar ao resultado. */
export function entradasLivres<C extends ColunaComRestricao>(formula: C, colunas: C[]): C[] {
  const ids = new Set(refsDaFormula(formula.config?.formula));
  return colunas.filter(c => ids.has(c.id) && !c.restrita);
}

export const ehRestrita = (c: Pick<ColunaComRestricao, 'restrita'> | undefined) => !!c?.restrita;
export const podeVerColuna = (c: ColunaComRestricao, uid: string, adm2: boolean) => !c.restrita || adm2 || (c.restrita.ver ?? []).includes(uid);

/** Colunas citadas numa fórmula ({@id} ou {@id#Mod}). */
export const refsDaFormula = (formula: unknown) => [...String(formula ?? '').matchAll(/\{@(\d+)(?:#\w+)?\}/g)].map(m => Number(m[1]));

/** Colunas que a pessoa vê: sem as restritas fora da lista dela nem as fórmulas que dependem delas (direta ou indiretamente). */
export function colunasQueVe<C extends ColunaComRestricao>(colunas: C[], uid: string, adm2: boolean): C[] {
  const ocultas = new Set(colunas.filter(c => !podeVerColuna(c, uid, adm2)).map(c => c.id));
  if (!ocultas.size) return colunas;
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const c of colunas) {
      if (c.tipo !== 'formula' || ocultas.has(c.id)) continue;
      if (refsDaFormula(c.config?.formula).some(r => ocultas.has(r))) { ocultas.add(c.id); mudou = true; }
    }
  }
  return colunas.filter(c => !ocultas.has(c.id));
}

/** Valores do item com os das colunas restritas que a pessoa vê (os de fora do item); as demais restritas saem. */
export function valoresComRestritas(valores: Record<string, unknown> | undefined, itemId: number, restritas: Map<number, Record<string, unknown> | null>): Record<string, unknown> {
  const out = { ...(valores ?? {}) };
  for (const [colunaId, mapa] of restritas) {
    const v = mapa?.[String(itemId)];
    if (v === undefined || v === null) delete out[String(colunaId)]; else out[String(colunaId)] = v;
  }
  return out;
}
