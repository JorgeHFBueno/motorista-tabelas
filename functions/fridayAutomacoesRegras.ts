// Regras das automações do Friday ("Quando… e só se… então…"): gatilho, condições e valor das ações.
// Funções puras, sem Firestore, usadas pelo executor (fridayAutomacoes.ts) e testadas em functions/test.
// O modelo é o da tela (src/features/friday-gestao-interna/quadro/Automacoes.tsx).
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md e 01_FIRESTORE/COLECOES/friday.md.

type AnyRecord = Record<string, any>;

export type Gatilho = { tipo: 'item_criado' | 'coluna_muda' | 'item_movido' | 'data_chega'; coluna_id?: number; grupo_id?: number | null; para?: string[]; dias?: number; ponta?: 'inicio' | 'fim' };
export type Condicao = { alvo: number | 'grupo'; op: string; valor?: unknown };
export type Acao = {
  tipo: string; coluna_id?: number; valor?: unknown; modo?: 'substituir' | 'adicionar'; grupo_id?: number | null; quadro_id?: number;
  para?: string[]; coluna_pessoa?: number | null; texto?: string; nome?: string; url?: string;
};
export type Automacao = { id: number; quadro_id: number; nome?: string | null; ativa?: number; modo?: 'todas' | 'qualquer'; gatilho: Gatilho; condicoes?: Condicao[]; acoes?: Acao[]; criado_por?: string | null };
export type Coluna = { id: number; titulo?: string; tipo: string; config?: AnyRecord };
/** Item como a tela vê: valores das colunas livres e oficiais juntos. */
export type ItemVisto = { id: number; nome?: string; grupo_id?: number | null; criado_por?: string | null; valores: AnyRecord };
/** Mudança registrada em friday-atividades (a tela grava uma para cada criação, valor alterado e item movido). */
export type Evento = { acao: string; coluna_id?: number | null };

/** Ações que o executor faz. "notificar" (avisos desligados) e "webhook" (o Friday é interno) não rodam. */
export const ACOES_SUPORTADAS = new Set(['definir', 'mover', 'subitem', 'arquivar', 'criar_item']);

const vazio = (v: unknown) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const lista = (v: unknown): string[] => (Array.isArray(v) ? v : v == null ? [] : [v]).map(String);
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Data "AAAA-MM-DD" somada de alguns dias (calendário, sem fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
/** Parte de data de um valor de coluna data ("2026-10-29" ou "2026-10-29 14:00") ou período ({ inicio, fim }). */
export function dataDoValor(v: unknown, ponta: 'inicio' | 'fim' = 'fim'): string | null {
  const t = v && typeof v === 'object' ? (v as AnyRecord)[ponta] : v;
  return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
}

/** O valor atual bate com algum dos valores escolhidos no "mudar para"? (vazio = qualquer mudança) */
function bateCom(coluna: Coluna | undefined, atual: unknown, escolhidos: string[] | undefined): boolean {
  if (!escolhidos?.length) return true;
  if (coluna?.tipo === 'caixa') return escolhidos.includes(atual ? '1' : '0');
  if (coluna?.tipo === 'status') return escolhidos.includes(String(atual ?? '0'));
  return lista(atual).some(x => escolhidos.includes(x));
}

/** O evento dispara o gatilho? "data_chega" não vem de evento (é a rodada periódica). */
export function gatilhoDispara(g: Gatilho, evento: Evento, item: ItemVisto, colunas: Coluna[]): boolean {
  switch (g.tipo) {
    case 'item_criado': return evento.acao === 'criou' && (g.grupo_id == null || Number(g.grupo_id) === Number(item.grupo_id));
    case 'item_movido': return evento.acao === 'moveu' && (g.grupo_id == null || Number(g.grupo_id) === Number(item.grupo_id));
    case 'coluna_muda': {
      if (evento.acao !== 'alterou' || g.coluna_id == null || Number(evento.coluna_id) !== Number(g.coluna_id)) return false;
      const coluna = colunas.find(c => c.id === Number(g.coluna_id));
      return bateCom(coluna, item.valores[String(g.coluna_id)], g.para);
    }
    default: return false;
  }
}

/** Dia em que o gatilho "data chegar" roda para o item (data da coluna ± dias), ou null sem data. */
export function diaDoGatilhoData(g: Gatilho, item: ItemVisto): string | null {
  if (g.tipo !== 'data_chega' || g.coluna_id == null) return null;
  const data = dataDoValor(item.valores[String(g.coluna_id)], g.ponta ?? 'fim');
  return data ? somarDias(data, Number(g.dias ?? 0)) : null;
}

/** Uma condição vale para o item? Mesmos operadores da tela. */
export function condicaoVale(c: Condicao, item: ItemVisto, colunas: Coluna[], hoje: string): boolean {
  if (c.alvo === 'grupo') {
    const tem = lista(c.valor).includes(String(item.grupo_id));
    return c.op === 'nao_e' ? !tem : tem;
  }
  const coluna = colunas.find(x => x.id === Number(c.alvo));
  if (!coluna) return false;
  const v = item.valores[String(coluna.id)];
  if (c.op === 'vazio') return coluna.tipo === 'status' ? vazio(v) || String(v) === '0' : vazio(v);
  if (c.op === 'preenchido') return !vazio(v);
  switch (coluna.tipo) {
    case 'status': {
      const rotulo = ((coluna.config?.rotulos ?? []) as AnyRecord[]).find(r => String(r.id) === String(v ?? '0'));
      if (c.op === 'concluido') return !!rotulo?.concluido;
      if (c.op === 'nao_concluido') return !rotulo?.concluido;
      const tem = lista(c.valor).includes(String(v ?? '0'));
      return c.op === 'nao_e' ? !tem : tem;
    }
    case 'lista': case 'pessoa': {
      const tem = lista(v).some(x => lista(c.valor).includes(x));
      return c.op === 'nao_e' ? !tem : tem;
    }
    case 'caixa': return c.op === 'marcada' ? !!v : !v;
    case 'numero': case 'avaliacao': {
      if (vazio(v) || vazio(c.valor)) return false;
      const a = Number(v), b = Number(c.valor);
      return c.op === 'maior' ? a > b : c.op === 'menor' ? a < b : a === b;
    }
    case 'data': case 'periodo': {
      const d = dataDoValor(v);
      if (!d) return false;
      return c.op === 'antes_hoje' ? d < hoje : c.op === 'hoje' ? d === hoje : d > hoje;
    }
    default: {
      const texto = semAcento(String(typeof v === 'object' && v ? (v.texto ?? v.url ?? '') : v ?? '').trim());
      const alvo = semAcento(String(c.valor ?? '').trim());
      return c.op === 'igual' ? texto === alvo : texto.includes(alvo);
    }
  }
}

/** Todas (ou qualquer uma, conforme o modo) as condições valem. Sem condições, vale. */
export function condicoesValem(a: Pick<Automacao, 'modo' | 'condicoes'>, item: ItemVisto, colunas: Coluna[], hoje: string): boolean {
  const cs = a.condicoes ?? [];
  if (!cs.length) return true;
  return a.modo === 'qualquer' ? cs.some(c => condicaoVale(c, item, colunas, hoje)) : cs.every(c => condicaoVale(c, item, colunas, hoje));
}

/** Texto com {nome} trocado pelo nome do item. */
export const comNome = (texto: unknown, item: ItemVisto) => String(texto ?? '').replace(/\{nome\}/g, String(item.nome ?? ''));

/**
 * Valor que a ação "mudar o valor" grava na coluna. undefined = limpar a célula.
 * Pessoa "0" = quem criou o item; "adicionar" junta ao que já existe; data { relativo: n } = hoje + n dias.
 */
export function valorDefinido(acao: Acao, coluna: Coluna, item: ItemVisto, hoje: string): unknown {
  const v = acao.valor;
  if (v === null) return undefined;
  switch (coluna.tipo) {
    case 'status': return v == null || v === '' ? undefined : String(v);
    case 'lista': case 'pessoa': {
      let ids = lista(v);
      if (coluna.tipo === 'pessoa') ids = ids.map(x => (x === '0' ? String(item.criado_por ?? '') : x)).filter(Boolean);
      if (acao.modo === 'adicionar') ids = [...lista(item.valores[String(coluna.id)]), ...ids];
      ids = [...new Set(ids)];
      return ids.length ? ids : undefined;
    }
    case 'caixa': return v ? true : undefined;
    case 'data': return v && typeof v === 'object' ? somarDias(hoje, Number((v as AnyRecord).relativo ?? 0)) : vazio(v) ? undefined : String(v);
    case 'numero': case 'avaliacao': return vazio(v) || !Number.isFinite(Number(v)) ? undefined : Number(v);
    default: return vazio(v) ? undefined : comNome(v, item);
  }
}

/** Texto legível de um valor, para o registro de atividade (o mesmo formato da tela). */
export function textoDoValor(coluna: Coluna, v: unknown, nomePessoa: (uid: string) => string = u => u): string | null {
  if (vazio(v)) return null;
  switch (coluna.tipo) {
    case 'status': return ((coluna.config?.rotulos ?? []) as AnyRecord[]).find(r => String(r.id) === String(v))?.texto || null;
    case 'lista': return lista(v).map(id => ((coluna.config?.opcoes ?? []) as AnyRecord[]).find(o => String(o.id) === id)?.texto ?? id).join(', ');
    case 'pessoa': return lista(v).map(nomePessoa).join(', ');
    case 'caixa': return v ? 'marcado' : null;
    default: return String(v);
  }
}

/** Chave que impede rodar duas vezes a mesma automação para o mesmo evento (ou o mesmo item no mesmo dia). */
export const chaveDoEvento = (automacaoId: number, atividadeId: number) => `atividade:${atividadeId}:${automacaoId}`;
export const chaveDaData = (automacaoId: number, itemId: number, dia: string) => `data:${automacaoId}:${itemId}:${dia}`;
