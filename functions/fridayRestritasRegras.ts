// Colunas restritas do Friday (2026-11-23): friday-colunas/{id}.restrita = { ver: [uids] }; os valores ficam fora do
// item, em friday-restritos/{colunaId} = { valores: { itemId: valor } }. A Admin SDK não passa pelas Rules: a API por
// chave filtra as colunas pela pessoa da chave (só quem está na lista e adm2 veem), e as automações (servidor) leem e
// gravam os valores aqui. Mesmas regras da tela em src/features/friday-gestao-interna/quadro/restritas.ts.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md ("Colunas restritas"). Funções puras (testes).
type AnyRecord = Record<string, any>;
export type ColunaComRestricao = { id: number | string; tipo?: string; config?: AnyRecord | null; restrita?: { ver?: string[] } | null };

export const ehRestrita = (c: Pick<ColunaComRestricao, 'restrita'> | undefined) => !!c?.restrita;
export const podeVerColuna = (c: ColunaComRestricao, uid: string, adm2: boolean) => !c.restrita || adm2 || (c.restrita.ver ?? []).includes(uid);

/** Colunas citadas numa fórmula ({@id} ou {@id#Mod}). */
export const refsDaFormula = (formula: unknown) => [...String(formula ?? '').matchAll(/\{@(\d+)(?:#\w+)?\}/g)].map(m => Number(m[1]));

/** Colunas que a pessoa vê: sem as restritas fora da lista dela nem as fórmulas que dependem delas (direta ou indiretamente). */
export function colunasQueVe<C extends ColunaComRestricao>(colunas: C[], uid: string, adm2: boolean): C[] {
  const ocultas = new Set(colunas.filter(c => !podeVerColuna(c, uid, adm2)).map(c => Number(c.id)));
  if (!ocultas.size) return colunas;
  for (let mudou = true; mudou;) {
    mudou = false;
    for (const c of colunas) {
      if (c.tipo !== 'formula' || ocultas.has(Number(c.id))) continue;
      if (refsDaFormula(c.config?.formula).some(r => ocultas.has(r))) { ocultas.add(Number(c.id)); mudou = true; }
    }
  }
  return colunas.filter(c => !ocultas.has(Number(c.id)));
}

/** Encaixa nos valores de um item os das colunas restritas (as que não têm valor saem). */
export function comValoresRestritos(valores: AnyRecord, itemId: number, restritos: Map<number, AnyRecord>): AnyRecord {
  const out = { ...valores };
  for (const [colunaId, mapa] of restritos) {
    const v = mapa[String(itemId)];
    if (v === undefined || v === null) delete out[String(colunaId)]; else out[String(colunaId)] = v;
  }
  return out;
}
