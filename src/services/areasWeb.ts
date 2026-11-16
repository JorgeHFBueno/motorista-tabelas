// Áreas da WEB (decisão do responsável de 2026-11-16; The Manuscript, funcionarios.md): funcionarios/{uid}.areas =
// { área: 'ver' | 'editar' }; área ausente = sem acesso. O adm2 vê e edita todas. O Friday tem um nível só (gravado
// como 'editar'). Só o adm2 dá áreas. As mesmas listas estão nas Functions (functions/credenciais.ts) e nas Rules.
export const AREAS = [
  { chave: 'combustivel', rotulo: 'Combustível', ver: 'Registros e Bombas', editar: 'lançar, corrigir, excluir e entrada de diesel' },
  { chave: 'frota', rotulo: 'Frota', ver: 'Veículos, Registros, Checklists e KPI', editar: 'renomear, KM inicial e normalizar KM' },
  { chave: 'logistica', rotulo: 'Logística', ver: 'Cronograma', editar: 'montar o cronograma' },
  { chave: 'engenharia', rotulo: 'Engenharia', ver: 'Cronograma, Prazos e Obras', editar: 'Status do LOTE e medições' },
  { chave: 'portal', rotulo: 'Portal do cliente', ver: 'Clientes, Contratos, Atendimento e Notícias', editar: 'logins, contratos, atendimento e notícias' },
  { chave: 'cadastros', rotulo: 'Cadastros', ver: 'lista de usuários', editar: 'criar e editar pessoas, credenciais do app e Kiosk' },
  { chave: 'manuscript', rotulo: 'The Manuscript', ver: 'leitor', editar: 'leitor e chat' },
  { chave: 'friday', rotulo: 'Friday', ver: '', editar: 'quadros (um nível só)' },
] as const;

export type Area = (typeof AREAS)[number]['chave'];
export type Nivel = 'ver' | 'editar';
export type Areas = Partial<Record<Area, Nivel>>;

export const AREAS_NIVEL_UNICO: readonly Area[] = ['friday'];
const CHAVES = AREAS.map((a) => a.chave) as readonly string[];

/** Áreas válidas de um mapa gravado (chaves e níveis desconhecidos saem; o Friday é sempre 'editar'). */
export function areasValidas(valor: unknown): Areas {
  const v = valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
  const areas: Areas = {};
  for (const a of CHAVES as readonly Area[]) {
    if (v[a] === 'editar' || v[a] === 'ver') areas[a] = AREAS_NIVEL_UNICO.includes(a) ? 'editar' : (v[a] as Nivel);
  }
  return areas;
}

/** Áreas em vigor de um funcionarios/{uid}: o mapa areas (documento sem ele não tem área). */
export function areasDoFuncionario(data: Record<string, unknown>): Areas {
  return areasValidas(data.areas);
}
