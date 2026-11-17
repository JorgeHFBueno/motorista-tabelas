import { areasDoFuncionario, type Areas } from '../services/areasWeb';
// Leitura dos cadastros ligados só por ID (The Manuscript, 01_FIRESTORE/COLECOES): veiculos-v2, obras-v2 e funcionarios.
// Funções puras; os serviços em src/services leem o Firestore e usam estas funções.

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const intOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null);
const byText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

export type CategoriaItemFrota = 'PLACA' | 'EXTRA';

/** Item de `veiculos-v2`. `identificador`/`nome` vêm de `identificacao`, como o snapshot exige. */
export interface ItemFrotaV2 {
  id: string;
  categoria: CategoriaItemFrota;
  identificador: string;
  nome: string;
  ativo: boolean;
  situacao: string | null;
  quilometragemInicial: number | null;
  /** Quando e de onde veio o KM inicial (2026-10-30): data do registro e "atividades/<id>", "03-combustivel/<id>" ou texto. */
  dataQuilometragemInicial: unknown;
  origemQuilometragemInicial: string | null;
  quilometragemUltima: number | null;
  dataUltimaAtualizacao: unknown;
  raw: Record<string, unknown>;
}

export function itemFrotaFromV2(id: string, data: Record<string, unknown>): ItemFrotaV2 | null {
  if (data.schemaVersion !== 2) return null;
  const identificacao = record(data.identificacao);
  const cadastro = record(data.cadastro);
  const operacional = record(data.operacional);
  const categoria = identificacao.categoria;
  // O snapshot precisa ser igual ao cadastro (Rules): guarda os textos como estão, sem aparar.
  const identificador = typeof identificacao.identificador === 'string' ? identificacao.identificador : '';
  const nome = typeof identificacao.nome === 'string' ? identificacao.nome : '';
  if ((categoria !== 'PLACA' && categoria !== 'EXTRA') || !identificador.trim() || !nome.trim()) return null;
  return {
    id,
    categoria,
    identificador,
    nome,
    ativo: cadastro.ativo === true,
    situacao: text(cadastro.situacao) || null,
    quilometragemInicial: intOrNull(operacional.quilometragemInicial),
    dataQuilometragemInicial: operacional.dataQuilometragemInicial ?? null,
    origemQuilometragemInicial: text(operacional.origemQuilometragemInicial) || null,
    quilometragemUltima: intOrNull(operacional.quilometragemUltima),
    dataUltimaAtualizacao: operacional.dataUltimaAtualizacao ?? null,
    raw: data,
  };
}

export function sortItensFrota(items: ItemFrotaV2[]) {
  return [...items].sort((a, b) => byText(a.identificador, b.identificador));
}

export function itemFrotaSnapshot(item: ItemFrotaV2) {
  return { categoria: item.categoria, identificador: item.identificador, nome: item.nome };
}

export function itemFrotaLabel(item: Pick<ItemFrotaV2, 'identificador' | 'nome'>) {
  return item.nome && item.nome !== item.identificador ? `${item.identificador} — ${item.nome}` : item.identificador;
}

/** Obra de `obras-v2`. A seleção padrão exclui `status == "FINALIZADA"`. */
export interface ObraV2 {
  id: string;
  codObra: number | string;
  siglaObra: string;
  nomeObra: string;
  local: string | null;
  status: string;
  /** LOTEs ativos, com a coordenada (o Cronograma Logístico preenche o Local por ela). */
  lotes: LoteV2[];
}

export interface Coordenada { lat: number; lng: number }

/** `lotes.{id}.coordenada` (coluna Coordenada dos subitens do Friday, 2026-11-17): `{ lat, lng }` válido, ou null. */
export function coordenadaDoLote(value: unknown): Coordenada | null {
  const { lat, lng } = record(value);
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

/** LOTE de uma obra de `obras-v2` (`lotes.{chave}`). */
export interface LoteV2 { chave: string; nome: string; status: string; coordenada: Coordenada | null }

/** LOTEs ativos da obra, na ordem do campo `ordem` (empate pela chave); sem os arquivados ou na lixeira do Friday (`situacao`). */
export function lotesDaObra(lotes: unknown): LoteV2[] {
  const ordem = (raw: Record<string, unknown>) =>
    typeof raw.ordem === 'number' && Number.isFinite(raw.ordem) ? raw.ordem : Number.MAX_SAFE_INTEGER;
  return Object.entries(record(lotes))
    .map(([chave, raw]) => ({ chave, raw: record(raw) }))
    .filter(({ raw }) => !text(raw.situacao))
    .sort((a, b) => ordem(a.raw) - ordem(b.raw) || a.chave.localeCompare(b.chave))
    .map(({ chave, raw }) => ({ chave, nome: text(raw.nome) || chave, status: text(raw.status), coordenada: coordenadaDoLote(raw.coordenada) }));
}

export function obraFromV2(id: string, data: Record<string, unknown>): ObraV2 | null {
  const codObra = typeof data.codObra === 'number' || typeof data.codObra === 'string' ? data.codObra : null;
  const nomeObra = typeof data.nomeObra === 'string' ? data.nomeObra : '';
  if (codObra === null || !nomeObra.trim() || typeof data.siglaObra !== 'string') return null;
  return {
    id,
    codObra,
    siglaObra: data.siglaObra,
    nomeObra,
    local: typeof data.local === 'string' ? data.local : null,
    status: text(data.status),
    lotes: lotesDaObra(data.lotes),
  };
}

export function obraSelecionavel(obra: ObraV2) {
  return obra.status.toUpperCase() !== 'FINALIZADA';
}

export function sortObras(obras: ObraV2[]) {
  return [...obras].sort((a, b) => byText(obraLabel(a), obraLabel(b)));
}

export function obraSnapshot(obra: ObraV2) {
  return { codObra: obra.codObra, siglaObra: obra.siglaObra, nomeObra: obra.nomeObra, local: obra.local };
}

export function obraLabel(obra: Pick<ObraV2, 'siglaObra' | 'nomeObra'>) {
  return obra.siglaObra.trim() ? `${obra.siglaObra} — ${obra.nomeObra}` : obra.nomeObra;
}

/** Pessoa ativa de `funcionarios/{uid}`. O nome fica como está no cadastro (o snapshot é comparado a ele). */
export interface PessoaV2 {
  uid: string;
  nome: string;
  perfis: Record<string, boolean>;
  // Áreas da WEB em vigor (2026-11-16).
  areas?: Areas;
}

export function pessoaFromFuncionario(uid: string, data: Record<string, unknown>): PessoaV2 | null {
  if (data.ativo !== true || typeof data.nome !== 'string' || !data.nome.trim()) return null;
  const perfis = Object.fromEntries(Object.entries(record(data.perfis)).map(([key, value]) => [key, value === true]));
  return { uid, nome: data.nome, perfis, areas: areasDoFuncionario(data) };
}

export function temPerfil(pessoa: PessoaV2, ...perfis: string[]) {
  return perfis.some((perfil) => pessoa.perfis[perfil] === true);
}

export function sortPessoas(pessoas: PessoaV2[]) {
  return [...pessoas].sort((a, b) => byText(a.nome, b.nome));
}
