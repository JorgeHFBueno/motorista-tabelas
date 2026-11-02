// Skills dos Crawlers: cada nível (a cada XP_POR_NIVEL de experiência) dá um ponto, gasto numa skill no Viveiro.
// Gastar é para sempre. Os pontos vêm da experiência, então criaturas de antes das skills já chegam com os delas.

export const XP_POR_NIVEL = 100;

export const SKILLS = ['leitura', 'palavras', 'movimento'] as const;
export type Skill = (typeof SKILLS)[number];
export type Skills = Record<Skill, number>;

export const SKILL: Record<Skill, { nome: string; max: number; efeito: (n: number) => string }> = {
  leitura: { nome: 'RAPIDEZ EM LEITURA', max: 10, efeito: (n) => `LE ${5 * n}% MAIS RAPIDO` },
  palavras: { nome: 'MAIS PALAVRAS', max: 2, efeito: (n) => `LE ${1 + n} ${n ? 'PALAVRAS' : 'PALAVRA'} POR VEZ` },
  movimento: { nome: 'VELOCIDADE', max: 10, efeito: (n) => `ANDA ${2 * n}% MAIS RAPIDO` },
};

export const SEM_SKILLS: Skills = { leitura: 0, palavras: 0, movimento: 0 };

/** Nível pela experiência: 1 até 99 XP, 2 a partir de 100, e assim por diante. */
export const nivelDe = (xp: number) => 1 + Math.floor(Math.max(0, xp) / XP_POR_NIVEL);

export const gastos = (s: Skills) => SKILLS.reduce((t, k) => t + s[k], 0);

/** Pontos ainda não gastos. */
export const pontosLivres = (xp: number, s: Skills) => Math.max(0, nivelDe(xp) - 1 - gastos(s));

/** Gasta um ponto na skill (se houver ponto e ela não estiver no máximo); senão, devolve as mesmas. */
export function aprender(xp: number, s: Skills, k: Skill): Skills {
  if (pontosLivres(xp, s) < 1 || s[k] >= SKILL[k].max) return s;
  return { ...s, [k]: s[k] + 1 };
}

/** Multiplicadores e quantidades que o Crawler usa. */
export function efeitos(s: Skills) {
  return { leitura: 1 + 0.05 * s.leitura, palavras: 1 + s.palavras, movimento: 1 + 0.02 * s.movimento };
}

export function normalizarSkills(valor: unknown): Skills {
  const v = valor && typeof valor === 'object' ? (valor as Record<string, unknown>) : {};
  const s = { ...SEM_SKILLS };
  for (const k of SKILLS) {
    const n = v[k];
    s[k] = typeof n === 'number' && Number.isFinite(n) ? Math.min(SKILL[k].max, Math.max(0, Math.floor(n))) : 0;
  }
  return s;
}
