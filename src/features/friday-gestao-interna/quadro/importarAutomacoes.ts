// Importação das automações exportadas do monday (board_automations_<id>.csv). O monday foi aposentado: o arquivo serve só
// para trazer, uma vez, as regras que cada equipe já usava. Ele traz cada regra como uma frase em inglês
// ("When Arquivo changes to Arquivar move item to OBRAS FINALIZADAS"); aqui a frase vira o modelo do Friday pelos nomes
// das colunas, rótulos e grupos do quadro. O que o arquivo não traz (ex.: "contains all these labels" sem os rótulos)
// é deduzido quando dá (rótulo com o nome do grupo de destino) ou a regra entra desligada para alguém completar.
// Regras que enviam para fora (webhook, e-mail) ou avisos não são importadas: o Friday é interno.
// Contrato: The Manuscript, 03_APLICACAO_WEB/13_FRIDAY_GESTAO_INTERNA.md.

type Rotulo = { id: string; texto: string };
type ColunaBase = { id: number; titulo: string; tipo: string; config: { rotulos?: Rotulo[]; opcoes?: Rotulo[] } };
type GrupoBase = { id: number; nome: string };
export type RegraImportada = {
  modo: 'todas'; gatilho: Record<string, unknown> & { tipo: string }; condicoes: { alvo: number | 'grupo'; op: string; valor?: unknown }[];
  acoes: (Record<string, unknown> & { tipo: string })[];
};
/** Uma linha do arquivo: a regra convertida (ou o motivo de não importar) e o que precisa de atenção. */
export type Importada = {
  origem_id: string; frase: string; dono: string; ativa_no_monday: boolean;
  regra?: RegraImportada;
  erro?: string;          // não importa
  pendencias: string[];   // importa desligada, para alguém completar
  avisos: string[];       // importa; conferir
};

// ---------------------------------------------------------------- CSV
/** CSV com aspas (campos com vírgula, aspas dobradas e quebras de linha). */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [], campo = '', aspas = false;
  const t = texto.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some(x => x.trim())) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some(x => x.trim())) linhas.push(linha);
  return linhas;
}

// ---------------------------------------------------------------- nomes
const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
/** A opção cujo nome é o começo do texto (a mais longa), e o resto do texto depois dela. */
function noInicio<T>(texto: string, opcoes: { nome: string; valor: T }[]): { valor: T; nome: string; resto: string } | null {
  const t = norm(texto);
  let melhor: { valor: T; nome: string; n: number } | null = null;
  for (const o of opcoes) {
    const n = norm(o.nome);
    if (!n || !t.startsWith(n) || /[a-z0-9]/.test(t[n.length] ?? '')) continue;
    if (!melhor || n.length > melhor.n) melhor = { valor: o.valor, nome: o.nome, n: n.length };
  }
  return melhor ? { valor: melhor.valor, nome: melhor.nome, resto: t.slice(melhor.n).trim() } : null;
}
const rotulosDe = (c: ColunaBase): Rotulo[] => ((c.tipo === 'status' ? c.config.rotulos : c.tipo === 'lista' ? c.config.opcoes : []) ?? []).filter((r: Rotulo) => r.id !== '0' && r.texto);
const tira = (t: string, prefixo: RegExp) => { const m = t.match(prefixo); return m ? t.slice(m[0].length).trim() : null; };

// ---------------------------------------------------------------- frase → regra
type Ctx = { colunas: ColunaBase[]; grupos: GrupoBase[] };

export function converterFrase(frase: string, ctx: Ctx): Pick<Importada, 'regra' | 'erro' | 'pendencias' | 'avisos'> {
  const pendencias: string[] = [], avisos: string[] = [];
  const colunas = ctx.colunas.map(c => ({ nome: c.titulo, valor: c }));
  const grupos = ctx.grupos.map(g => ({ nome: g.nome, valor: g }));
  const fora = /\b(webhook|e-?mail|notify|notification|send|slack|integration)\b/;
  let t = norm(frase);
  if (fora.test(t)) return { erro: 'envia aviso ou dados para fora (webhook, e-mail, notificação): o Friday é interno', pendencias, avisos };
  const depoisWhen = tira(t, /^when /);
  if (depoisWhen == null) return { erro: 'frase não reconhecida (não começa com "When")', pendencias, avisos };
  t = depoisWhen;

  // ---- Quando
  let gatilho: RegraImportada['gatilho'];
  let r: string | null;
  if ((r = tira(t, /^(an )?item is created( in this group)?/)) != null) {
    gatilho = { tipo: 'item_criado', grupo_id: null };
    if (/in this group/.test(t.slice(0, t.length - r.length))) pendencias.push('O arquivo não diz o grupo do "item criado": escolha o grupo.');
    t = r;
  } else if ((r = tira(t, /^(an )?item is moved to /)) != null) {
    const g = noInicio(r, grupos);
    gatilho = { tipo: 'item_movido', grupo_id: g?.valor.id ?? null };
    if (!g) pendencias.push('O arquivo não diz para qual grupo o item é movido: escolha o grupo.');
    t = g ? g.resto : r.replace(/^this group/, '').trim();
  } else {
    const c = noInicio(t, colunas);
    if (!c) return { erro: 'a coluna do "When" não existe neste quadro', pendencias, avisos };
    t = c.resto;
    if ((r = tira(t, /^arrives/)) != null) {
      gatilho = { tipo: 'data_chega', coluna_id: c.valor.id, dias: 0 };
      t = r;
    } else if ((r = tira(t, /^changes( from .+?)? to /)) != null) {
      const rotulo = noInicio(r, rotulosDe(c.valor).map(x => ({ nome: x.texto, valor: x })));
      gatilho = { tipo: 'coluna_muda', coluna_id: c.valor.id, para: rotulo ? [rotulo.valor.id] : [] };
      if (!rotulo) pendencias.push(`O rótulo de “${c.valor.titulo}” não existe neste quadro: escolha o rótulo.`);
      t = rotulo ? rotulo.resto : r;
    } else if ((r = tira(t, /^changes/)) != null) {
      gatilho = { tipo: 'coluna_muda', coluna_id: c.valor.id, para: [] };
      t = r;
    } else return { erro: `o que acontece com “${c.valor.titulo}” não foi reconhecido`, pendencias, avisos };
  }

  // ---- E só se
  const condicoes: RegraImportada['condicoes'] = [];
  const semRotulo: { coluna: ColunaBase; indice: number }[] = [];
  while ((r = tira(t, /^,?\s*and (only if )?/)) != null && !/^(move|archive|change|set|assign|create)\b/.test(r)) {
    const c = noInicio(r, colunas);
    if (!c) return { erro: 'a coluna da condição ("only if") não existe neste quadro', pendencias, avisos };
    t = c.resto;
    const generico = tira(t, /^(contains|is|has) (all|any) (of )?these labels|^(is|contains) something/);
    let valorTexto = generico == null ? tira(t, /^(is|contains|has) /) : null;
    if (generico != null) { t = generico; valorTexto = null; }
    const rotulo = valorTexto != null ? noInicio(valorTexto, rotulosDe(c.valor).map(x => ({ nome: x.texto, valor: x }))) : null;
    if (rotulo) { condicoes.push({ alvo: c.valor.id, op: 'e', valor: [rotulo.valor.id] }); t = rotulo.resto; continue; }
    if (valorTexto != null) t = valorTexto;
    semRotulo.push({ coluna: c.valor, indice: condicoes.length });
    condicoes.push({ alvo: c.valor.id, op: 'e', valor: [] });
  }

  // ---- Então
  const acoes: RegraImportada['acoes'] = [];
  for (;;) {
    t = t.replace(/^(,|then|and)\s*/, '').replace(/^(,|then|and)\s*/, '').trim();
    if (!t) break;
    if ((r = tira(t, /^move (the )?item to /)) != null) {
      const g = noInicio(r, grupos);
      if (!g) return { erro: 'o grupo de destino não existe neste quadro', pendencias, avisos };
      acoes.push({ tipo: 'mover', grupo_id: g.valor.id });
      t = g.resto;
    } else if ((r = tira(t, /^archive (the )?item/)) != null) {
      acoes.push({ tipo: 'arquivar' }); t = r;
    } else if ((r = tira(t, /^(change|set) /)) != null) {
      const c = noInicio(r, colunas);
      const resto = c ? tira(c.resto, /^to /) : null;
      if (!c || resto == null) return { erro: 'a coluna da ação "change/set" não existe neste quadro', pendencias, avisos };
      if (c.valor.tipo === 'data' && (r = tira(resto, /^(today|current date)/)) != null) { acoes.push({ tipo: 'definir', coluna_id: c.valor.id, valor: { relativo: 0 } }); t = r; continue; }
      const rotulo = noInicio(resto, rotulosDe(c.valor).map(x => ({ nome: x.texto, valor: x })));
      if (!rotulo) return { erro: `o valor da ação em “${c.valor.titulo}” não foi reconhecido`, pendencias, avisos };
      acoes.push({ tipo: 'definir', coluna_id: c.valor.id, valor: c.valor.tipo === 'lista' ? [rotulo.valor.id] : rotulo.valor.id });
      t = rotulo.resto;
    } else if ((r = tira(t, /^assign (the )?(item )?creator as /)) != null) {
      const c = noInicio(r, colunas.filter(x => x.valor.tipo === 'pessoa'));
      if (!c) return { erro: 'a coluna de pessoa da ação não existe neste quadro', pendencias, avisos };
      acoes.push({ tipo: 'definir', coluna_id: c.valor.id, valor: ['0'], modo: 'adicionar' }); t = c.resto;
    } else if ((r = tira(t, /^create (a )?(new )?subitems?/)) != null) {
      acoes.push({ tipo: 'subitem', nome: '' }); pendencias.push('O arquivo não traz o nome do subitem: informe o nome.'); t = r;
    } else return { erro: `ação não reconhecida: “${t.slice(0, 60)}”`, pendencias, avisos };
  }
  if (!acoes.length) return { erro: 'a regra não tem ação reconhecida', pendencias, avisos };

  // Condição sem os rótulos (o arquivo não traz): rótulo que é o começo de uma palavra do grupo de destino
  // ("Pública" → OBRAS PÚBLICAS). Sem isso, a regra entra desligada.
  const destino = acoes.find(a => a.tipo === 'mover');
  const nomeDestino = destino ? ctx.grupos.find(g => g.id === destino.grupo_id)?.nome ?? '' : '';
  for (const { coluna, indice } of semRotulo) {
    const palavras = norm(nomeDestino).split(/[^a-z0-9]+/).filter(Boolean);
    const achados = rotulosDe(coluna).filter(x => { const n = norm(x.texto); return n.length >= 4 && palavras.some(p => p.startsWith(n)); });
    if (achados.length === 1) {
      condicoes[indice].valor = [achados[0].id];
      avisos.push(`O arquivo não traz os rótulos de “${coluna.titulo}”: usado “${achados[0].texto}”, pelo nome do grupo ${nomeDestino}. Confira.`);
    } else pendencias.push(`O arquivo não traz os rótulos da condição em “${coluna.titulo}”: escolha os rótulos.`);
  }
  return { regra: { modo: 'todas', gatilho, condicoes, acoes }, pendencias, avisos };
}

/** Lê o CSV exportado do monday e converte cada automação. */
export function lerAutomacoesMonday(texto: string, ctx: Ctx): Importada[] {
  const [cab, ...linhas] = lerCsv(texto);
  if (!cab) return [];
  const pos = (nome: string) => cab.findIndex(h => norm(h) === nome);
  const iId = pos('id'), iFrase = pos('sentence'), iDono = pos('owner'), iEstado = pos('state');
  if (iFrase < 0) throw new Error('Arquivo sem a coluna "Sentence": use o CSV de automações exportado do monday.');
  return linhas.map(l => {
    const frase = String(l[iFrase] ?? '').replace(/\s+/g, ' ').trim();
    return {
      origem_id: `monday:${String(l[iId] ?? '').trim()}`, frase, dono: String(l[iDono] ?? '').trim(), ativa_no_monday: norm(String(l[iEstado] ?? 'active')) === 'active',
      ...converterFrase(frase, ctx),
    };
  });
}
