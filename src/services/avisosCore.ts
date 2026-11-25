// Avisos do sistema (sino do cabeçalho): regras puras, sem Firebase; teste em tests/avisos.test.ts.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/avisos.md (avisos/{uid}/itens/{id}).

/** Aviso como o sino mostra. `rota` é o caminho da tela que ele abre; `deNome` é quem gerou (vazio = o sistema). */
export type Aviso = {
  id: string;
  area: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  rota: string | null;
  local: string | null;
  deNome: string | null;
  lida: boolean;
  criadoEm: Date | null;
  /** Grupo do acontecimento: sem ele (avisos antigos, portal), o aviso não aceita reação. */
  grupo: string | null;
  /** Reações de quem esteve no aviso, uma por pessoa (a mais recente), da mais antiga para a mais nova. */
  reacoes: Reacao[];
};

export type Reacao = { uid: string; emoji: string; nome: string; em: number };

/** Os emojis da fileira do menu "Reagir" (os mesmos de functions/avisosReagirDominio.ts). */
export const EMOJIS_REACAO = ['👍', '👀', '✅', '❤️', '🙏', '😂', '❌', '😡', '🫡'] as const;

/** reacoes {uid: {emoji, nome, em}} do documento → lista, da mais antiga para a mais nova (sem horário, no fim). */
export function lerReacoes(v: unknown): Reacao[] {
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v as Record<string, unknown>).flatMap(([uid, r]) => {
    const x = r as { emoji?: unknown; nome?: unknown; em?: { toMillis?: () => number } } | null;
    if (!x || typeof x.emoji !== 'string' || !x.emoji) return [];
    const em = typeof x.em?.toMillis === 'function' ? x.em.toMillis() : Number.MAX_SAFE_INTEGER;
    return [{ uid, emoji: x.emoji, nome: typeof x.nome === 'string' ? x.nome.trim() : '', em }];
  }).sort((a, b) => a.em - b.em);
}

/** "👍 Jorge, Ana · ❤️ Bia": as reações por emoji, na ordem em que apareceram. */
export function resumoReacoes(reacoes: Reacao[]): { emoji: string; nomes: string[] }[] {
  const grupos = new Map<string, string[]>();
  for (const r of reacoes) grupos.set(r.emoji, [...(grupos.get(r.emoji) ?? []), r.nome || 'Alguém']);
  return [...grupos].map(([emoji, nomes]) => ({ emoji, nomes }));
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Documento do Firestore → Aviso (campos ausentes ou de outro tipo viram vazio; criadoEm aceita Timestamp ou Date). */
export function lerAviso(id: string, d: Record<string, unknown>): Aviso {
  const c = d.criadoEm as { toDate?: () => Date } | Date | null | undefined;
  const criadoEm = c instanceof Date ? c : typeof c?.toDate === 'function' ? c.toDate() : null;
  return {
    id,
    area: texto(d.area),
    tipo: texto(d.tipo),
    titulo: texto(d.titulo) || 'Aviso',
    mensagem: texto(d.mensagem),
    rota: rotaSegura(d.rota),
    local: texto(d.local) || null,
    deNome: texto(d.deNome) || null,
    lida: d.lida === true,
    criadoEm,
    grupo: texto(d.grupo) || null,
    reacoes: lerReacoes(d.reacoes),
  };
}

/** Só caminhos do próprio sistema ("/friday/..."); endereço externo ou "//host" não abre. */
export function rotaSegura(rota: unknown): string | null {
  const r = texto(rota);
  return r.startsWith('/') && !r.startsWith('//') ? r : null;
}

export type Periodo = 'Hoje' | 'Últimos 7 dias' | 'Mais antigos';
const PERIODOS: Periodo[] = ['Hoje', 'Últimos 7 dias', 'Mais antigos'];

/** Período do aviso: hoje, nos 6 dias antes de hoje ou antes disso (sem data = mais antigos). */
export function periodoDoAviso(criadoEm: Date | null, agora: Date): Periodo {
  if (!criadoEm || Number.isNaN(criadoEm.getTime())) return 'Mais antigos';
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  if (criadoEm >= inicioHoje) return 'Hoje';
  const inicioSemana = new Date(inicioHoje);
  inicioSemana.setDate(inicioHoje.getDate() - 6);
  return criadoEm >= inicioSemana ? 'Últimos 7 dias' : 'Mais antigos';
}

/** Avisos em grupos por período, na ordem Hoje, Últimos 7 dias, Mais antigos; grupos vazios ficam de fora. */
export function agruparAvisos<T>(lista: T[], agora: Date, criadoEm: (n: T) => Date | null): { periodo: Periodo; avisos: T[] }[] {
  return PERIODOS.map(periodo => ({ periodo, avisos: lista.filter(n => periodoDoAviso(criadoEm(n), agora) === periodo) })).filter(g => g.avisos.length);
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca do sino: todas as palavras do termo, sem acento nem maiúsculas, em algum dos textos do aviso. */
export function filtrarAvisos<T>(lista: T[], termo: string, textos: (n: T) => unknown[]): T[] {
  const palavras = normalizar(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return lista;
  return lista.filter(n => {
    const alvo = normalizar(textos(n).filter(x => x != null).join(' '));
    return palavras.every(p => alvo.includes(p));
  });
}

/** "agora", "há 5 min", "há 3 h", "ontem 14:30" ou "12 nov 14:30" (com o ano, se for outro). */
export function tempoRelativo(d: Date | null, agora = new Date()): string {
  if (!d || Number.isNaN(d.getTime())) return '';
  const seg = (agora.getTime() - d.getTime()) / 1000;
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (d.toDateString() === agora.toDateString()) return `há ${Math.floor(seg / 3600)} h`;
  const ontem = new Date(agora);
  ontem.setDate(agora.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
  const dia = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: d.getFullYear() !== agora.getFullYear() ? 'numeric' : undefined });
  return `${dia.replace('.', '')} ${hora}`;
}
