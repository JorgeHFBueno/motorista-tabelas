// Uso do sistema (Cadastros → Uso do sistema, só adm2): quantas vezes cada pessoa abre cada tela da WEB, por dia.
// uso-web/{uid}_{AAAA-MM-DD} = { uid, dia, telas: { rota: aberturas }, atualizadoEm }. Só a WEB: o app Flutter não entra.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/uso-web.md.

export type Grupo = { chave: string; rotulo: string };

export const GRUPOS: readonly Grupo[] = [
  { chave: 'geral', rotulo: 'Geral' },
  { chave: 'motorista', rotulo: 'Motorista (WEB no celular)' },
  { chave: 'logistica', rotulo: 'Logística' },
  { chave: 'mecanica', rotulo: 'Mecânica' },
  { chave: 'engenharia', rotulo: 'Engenharia' },
  { chave: 'comercial', rotulo: 'Comercial' },
  { chave: 'erp', rotulo: 'ERP' },
  { chave: 'portal', rotulo: 'Portal do cliente' },
  { chave: 'cadastros', rotulo: 'Cadastros' },
  { chave: 'friday', rotulo: 'Friday' },
  { chave: 'manuscript', rotulo: 'The Manuscript' },
  { chave: 'outros', rotulo: 'Testes e DEV' },
];

export type Tela = { rota: string; rotulo: string; grupo: string };

// Uma linha por rota de src/App.tsx (menos login e privacidade, que são sem sessão); a rota é a chave gravada.
// Ordem importa: a primeira que casa vale (as fixas antes das com :id e *). O teste confere que nenhuma rota ficou de fora.
export const TELAS: readonly Tela[] = [
  { rota: 'inicio', rotulo: 'Início', grupo: 'geral' },
  { rota: 'perfil', rotulo: 'Meu perfil', grupo: 'geral' },
  { rota: 'motorista', rotulo: 'Motorista (início)', grupo: 'motorista' },
  { rota: 'motorista/como-usar', rotulo: 'Como usar', grupo: 'motorista' },
  { rota: 'motorista/historico', rotulo: 'Histórico do motorista', grupo: 'motorista' },
  { rota: 'motorista/saida', rotulo: 'Saída', grupo: 'motorista' },
  { rota: 'motorista/chegada', rotulo: 'Chegada', grupo: 'motorista' },
  { rota: 'motorista/checklist', rotulo: 'Checklist', grupo: 'motorista' },
  { rota: 'motorista/checklist/itens', rotulo: 'Checklist: itens', grupo: 'motorista' },
  { rota: 'motorista/checklist/historico', rotulo: 'Checklist: histórico', grupo: 'motorista' },
  { rota: 'motorista/checklist/historico/:id', rotulo: 'Checklist: detalhe', grupo: 'motorista' },
  { rota: 'motorista/revisao', rotulo: 'Revisão', grupo: 'motorista' },
  { rota: 'motorista/revisao/historico', rotulo: 'Revisão: histórico', grupo: 'motorista' },
  { rota: 'motorista/revisao/historico/:id', rotulo: 'Revisão: detalhe', grupo: 'motorista' },
  { rota: 'motorista/revisao/:id', rotulo: 'Revisão: registro', grupo: 'motorista' },
  { rota: 'logistica/kpi', rotulo: 'KPI', grupo: 'logistica' },
  { rota: 'logistica/combustivel/registros', rotulo: 'Abastecimentos', grupo: 'logistica' },
  { rota: 'logistica/combustivel/registros/novo', rotulo: 'Novo abastecimento', grupo: 'logistica' },
  { rota: 'logistica/combustivel/bombas', rotulo: 'Bombas', grupo: 'logistica' },
  { rota: 'logistica/cronograma', rotulo: 'Cronograma logístico', grupo: 'logistica' },
  { rota: 'mecanica/veiculos', rotulo: 'Veículos', grupo: 'mecanica' },
  { rota: 'mecanica/veiculos/:id', rotulo: 'Veículo: detalhe', grupo: 'mecanica' },
  { rota: 'mecanica/registros', rotulo: 'Registros', grupo: 'mecanica' },
  { rota: 'mecanica/checklists', rotulo: 'Checklists', grupo: 'mecanica' },
  { rota: 'mecanica/checklists/:id', rotulo: 'Checklist: detalhe', grupo: 'mecanica' },
  { rota: 'mecanica/revisoes', rotulo: 'Revisões', grupo: 'mecanica' },
  { rota: 'mecanica/revisoes/:id', rotulo: 'Revisão: detalhe', grupo: 'mecanica' },
  { rota: 'engenharia/cronograma', rotulo: 'Cronograma de obras', grupo: 'engenharia' },
  { rota: 'engenharia/obras', rotulo: 'Obras', grupo: 'engenharia' },
  { rota: 'engenharia/obras/:id', rotulo: 'Obra: detalhe', grupo: 'engenharia' },
  { rota: 'comercial', rotulo: 'Painel comercial', grupo: 'comercial' },
  { rota: 'comercial/negocios', rotulo: 'Negócios', grupo: 'comercial' },
  { rota: 'comercial/contatos', rotulo: 'Contatos', grupo: 'comercial' },
  { rota: 'erp', rotulo: 'ERP (início)', grupo: 'erp' },
  { rota: 'erp/pessoas', rotulo: 'Clientes e Fornecedores', grupo: 'erp' },
  { rota: 'erp/pessoas/:codigo', rotulo: 'Cliente/Fornecedor: ficha', grupo: 'erp' },
  { rota: 'erp/vendedores', rotulo: 'Vendedores', grupo: 'erp' },
  { rota: 'erp/produtos', rotulo: 'Produtos', grupo: 'erp' },
  { rota: 'erp/produtos/:codigo', rotulo: 'Produto: ficha', grupo: 'erp' },
  { rota: 'erp/estoques', rotulo: 'Conferência de Estoques', grupo: 'erp' },
  { rota: 'erp/estoques/kardex', rotulo: 'Kardex', grupo: 'erp' },
  { rota: 'erp/estoques/contagens', rotulo: 'Contagens de produtos', grupo: 'erp' },
  { rota: 'erp/estoques/contagens/:codigo', rotulo: 'Contagem: ficha', grupo: 'erp' },
  { rota: 'erp/estoques/acerto', rotulo: 'Acerto de estoque', grupo: 'erp' },
  { rota: 'erp/estoques/relatorios/:relatorio', rotulo: 'Relatório de estoque', grupo: 'erp' },
  { rota: 'portal-cliente/clientes', rotulo: 'Clientes', grupo: 'portal' },
  { rota: 'portal-cliente/contratos', rotulo: 'Contratos', grupo: 'portal' },
  { rota: 'portal-cliente/contratos/:id', rotulo: 'Contrato: detalhe', grupo: 'portal' },
  { rota: 'portal-cliente/atendimento', rotulo: 'Atendimento', grupo: 'portal' },
  { rota: 'portal-cliente/noticias', rotulo: 'Notícias', grupo: 'portal' },
  { rota: 'cadastros/editar/usuarios', rotulo: 'Usuários', grupo: 'cadastros' },
  { rota: 'cadastros/usuarios/novo', rotulo: 'Novo usuário', grupo: 'cadastros' },
  { rota: 'cadastros/apis', rotulo: 'APIs', grupo: 'cadastros' },
  { rota: 'cadastros/uso', rotulo: 'Uso do sistema', grupo: 'cadastros' },
  { rota: 'friday/*', rotulo: 'Friday', grupo: 'friday' },
  { rota: 'the-manuscript/mapa', rotulo: 'Mapa do Manuscript', grupo: 'manuscript' },
  { rota: 'the-manuscript/*', rotulo: 'Leitor do Manuscript', grupo: 'manuscript' },
  { rota: 'testes/mki', rotulo: 'Teste MKI', grupo: 'outros' },
  { rota: 'testes/mkii', rotulo: 'Teste MKII', grupo: 'outros' },
  { rota: 'dev', rotulo: 'DEV', grupo: 'outros' },
];

/** A tela de um caminho (ex.: '/mecanica/veiculos/abc' → 'mecanica/veiculos/:id'); null = não contada. */
export function telaDaRota(pathname: string): string | null {
  const partes = pathname.split('/').filter(Boolean);
  if (partes.length === 0) return 'inicio';
  for (const { rota } of TELAS) {
    const padrao = rota.split('/');
    const estrela = padrao[padrao.length - 1] === '*';
    const fixas = estrela ? padrao.slice(0, -1) : padrao;
    if (estrela ? partes.length < fixas.length : partes.length !== fixas.length) continue;
    if (fixas.every((p, i) => p === partes[i] || (p.startsWith(':') && partes[i] !== undefined))) return rota;
  }
  return null;
}

/** Dia em Brasília (AAAA-MM-DD). */
export function diaBrasilia(data: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(data);
}

export const idDoUso = (uid: string, dia: string) => `${uid}_${dia}`;

/** Os dias do período, do mais antigo a hoje (AAAA-MM-DD, em Brasília). */
export function diasDoPeriodo(hoje: Date, quantos: number): string[] {
  const fim = diaBrasilia(hoje);
  const base = Date.UTC(Number(fim.slice(0, 4)), Number(fim.slice(5, 7)) - 1, Number(fim.slice(8, 10)));
  return Array.from({ length: quantos }, (_, i) => new Date(base - (quantos - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export type RegistroDeUso = { uid: string; dia: string; telas: Record<string, number> };
export type PessoaDoUso = { uid: string; nome: string; adm2: boolean; temAreaWeb: boolean };

/** Registro lido de uso-web (campos inválidos saem). */
export function registroDeUso(data: Record<string, unknown>): RegistroDeUso | null {
  if (typeof data.uid !== 'string' || typeof data.dia !== 'string') return null;
  const bruto = data.telas && typeof data.telas === 'object' ? (data.telas as Record<string, unknown>) : {};
  const telas: Record<string, number> = {};
  for (const [tela, n] of Object.entries(bruto)) if (typeof n === 'number' && n > 0) telas[tela] = n;
  return { uid: data.uid, dia: data.dia, telas };
}

export type LinhaTela = Tela & { aberturas: number; pessoas: number; ultimoDia: string | null };
export type LinhaGrupo = Grupo & { aberturas: number; pessoas: number; telasSemUso: number; telas: number };
export type LinhaPessoa = { uid: string; nome: string; aberturas: number; dias: number; ultimoDia: string | null; principais: string[] };
export type LinhaDia = { dia: string; pessoas: number; aberturas: number };
export type ResumoDeUso = {
  pessoas: number;
  aberturas: number;
  mediaPessoasPorDia: number;
  porTela: LinhaTela[];
  porGrupo: LinhaGrupo[];
  porPessoa: LinhaPessoa[];
  porDia: LinhaDia[];
};

const rotuloDaTela = (rota: string) => TELAS.find((t) => t.rota === rota)?.rotulo ?? rota;

/**
 * Resumo do período. Sem o adm2 (contarAdm2 = false), os registros de quem tem adm2 saem. Em Pessoas aparecem quem usou
 * e quem tem área da WEB e não usou; quem só tem credencial do app e não abriu a WEB não aparece (usa o app, que não conta).
 */
export function resumirUso(registros: RegistroDeUso[], pessoas: PessoaDoUso[], dias: string[], contarAdm2: boolean): ResumoDeUso {
  const pessoaPorUid = new Map(pessoas.map((p) => [p.uid, p]));
  const periodo = new Set(dias);
  const validos = registros.filter((r) => periodo.has(r.dia) && (contarAdm2 || !pessoaPorUid.get(r.uid)?.adm2));

  const telas = new Map<string, { aberturas: number; pessoas: Set<string>; ultimoDia: string | null }>();
  const porPessoa = new Map<string, { aberturas: number; dias: Set<string>; ultimoDia: string | null; telas: Map<string, number> }>();
  const porDia = new Map(dias.map((d) => [d, { pessoas: new Set<string>(), aberturas: 0 }]));
  const maior = (a: string | null, b: string) => (a && a > b ? a : b);

  for (const r of validos) {
    const pessoa = porPessoa.get(r.uid) ?? { aberturas: 0, dias: new Set<string>(), ultimoDia: null, telas: new Map<string, number>() };
    porPessoa.set(r.uid, pessoa);
    const dia = porDia.get(r.dia)!;
    for (const [rota, n] of Object.entries(r.telas)) {
      const t = telas.get(rota) ?? { aberturas: 0, pessoas: new Set<string>(), ultimoDia: null };
      telas.set(rota, t);
      t.aberturas += n;
      t.pessoas.add(r.uid);
      t.ultimoDia = maior(t.ultimoDia, r.dia);
      pessoa.aberturas += n;
      pessoa.telas.set(rota, (pessoa.telas.get(rota) ?? 0) + n);
      dia.aberturas += n;
    }
    pessoa.dias.add(r.dia);
    pessoa.ultimoDia = maior(pessoa.ultimoDia, r.dia);
    dia.pessoas.add(r.uid);
  }

  const conhecidas = new Set(TELAS.map((t) => t.rota));
  const porTela: LinhaTela[] = [
    ...TELAS,
    ...[...telas.keys()].filter((rota) => !conhecidas.has(rota)).map((rota) => ({ rota, rotulo: rota, grupo: 'outros' })),
  ].map((t) => {
    const u = telas.get(t.rota);
    return { ...t, aberturas: u?.aberturas ?? 0, pessoas: u?.pessoas.size ?? 0, ultimoDia: u?.ultimoDia ?? null };
  }).sort((a, b) => b.aberturas - a.aberturas || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const porGrupo: LinhaGrupo[] = GRUPOS.map((g) => {
    const linhas = porTela.filter((t) => t.grupo === g.chave);
    const quem = new Set(linhas.flatMap((t) => [...(telas.get(t.rota)?.pessoas ?? [])]));
    return {
      ...g,
      aberturas: linhas.reduce((s, t) => s + t.aberturas, 0),
      pessoas: quem.size,
      telas: linhas.length,
      telasSemUso: linhas.filter((t) => t.aberturas === 0).length,
    };
  }).sort((a, b) => b.aberturas - a.aberturas || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));

  const uids = new Set([
    ...porPessoa.keys(),
    ...pessoas.filter((p) => p.temAreaWeb && (contarAdm2 || !p.adm2)).map((p) => p.uid),
  ]);
  const linhasPessoa: LinhaPessoa[] = [...uids].map((uid) => {
    const u = porPessoa.get(uid);
    const principais = [...(u?.telas ?? new Map<string, number>()).entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([rota]) => rotuloDaTela(rota));
    return { uid, nome: pessoaPorUid.get(uid)?.nome ?? uid, aberturas: u?.aberturas ?? 0, dias: u?.dias.size ?? 0, ultimoDia: u?.ultimoDia ?? null, principais };
  }).sort((a, b) => b.dias - a.dias || b.aberturas - a.aberturas || a.nome.localeCompare(b.nome, 'pt-BR'));

  const linhasDia: LinhaDia[] = dias.map((d) => ({ dia: d, pessoas: porDia.get(d)!.pessoas.size, aberturas: porDia.get(d)!.aberturas })).reverse();
  const somaPessoasDia = linhasDia.reduce((s, d) => s + d.pessoas, 0);

  return {
    pessoas: porPessoa.size,
    aberturas: linhasDia.reduce((s, d) => s + d.aberturas, 0),
    mediaPessoasPorDia: dias.length ? somaPessoasDia / dias.length : 0,
    porTela,
    porGrupo,
    porPessoa: linhasPessoa,
    porDia: linhasDia,
  };
}
