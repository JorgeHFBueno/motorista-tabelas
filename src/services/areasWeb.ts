// Áreas da WEB (decisão do responsável de 2026-11-16; The Manuscript, funcionarios.md): funcionarios/{uid}.areas =
// { área: 'ver' | 'editar' }; área ausente = sem acesso. O adm2 vê e edita todas. O Friday e a Tools têm um nível
// só (gravado como 'editar'). Só o adm2 dá áreas. As mesmas listas estão nas Functions (functions/credenciais.ts) e nas Rules.
export const AREAS = [
  { chave: 'logistica', rotulo: 'Logística', ver: 'KPI, abastecimentos, bombas e Cronograma', editar: 'lançar e corrigir abastecimentos, entrada de diesel e montar o cronograma' },
  { chave: 'mecanica', rotulo: 'Mecânica', ver: 'Veículos, Registros e Checklists', editar: 'renomear, KM inicial, normalizar KM e manutenções' },
  { chave: 'engenharia', rotulo: 'Engenharia', ver: 'Cronograma, Prazos e Obras', editar: 'Status do LOTE e medições' },
  { chave: 'comercial', rotulo: 'Comercial', ver: 'Painel, Negócios e Contatos', editar: 'criar e editar negócios e contatos, mover no funil e arquivos' },
  { chave: 'erp', rotulo: 'ERP', ver: 'telas do ERP em demonstração (sem gravação) e a aprovação de cada página', editar: 'aprovar ou não cada página do ERP; cadastrar e editar quando houver gravação' },
  { chave: 'portal', rotulo: 'Portal do cliente', ver: 'Clientes, Contratos, Atendimento e Notícias', editar: 'logins, contratos, atendimento e notícias' },
  { chave: 'cadastros', rotulo: 'Cadastros', ver: 'lista de usuários', editar: 'criar e editar pessoas, credenciais do app e Kiosk' },
  { chave: 'manuscript', rotulo: 'The Manuscript', ver: 'leitor', editar: 'leitor e chat' },
  { chave: 'friday', rotulo: 'Friday', ver: '', editar: 'quadros (um nível só)' },
  { chave: 'tools', rotulo: 'Tools', ver: '', editar: 'Ferramentas ao lado do sino, como o Canvas (um nível só)' },
] as const;

export type Area = (typeof AREAS)[number]['chave'];
export type Nivel = 'ver' | 'editar';
export type Areas = Partial<Record<Area, Nivel>>;

export const AREAS_NIVEL_UNICO: readonly Area[] = ['friday', 'tools'];
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
