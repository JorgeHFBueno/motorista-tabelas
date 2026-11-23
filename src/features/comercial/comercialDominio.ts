// Comercial (CRM da WEB, 2026-11-23): regras puras de negócios e contatos, sem Firebase.
// Contrato: The Manuscript, 01_FIRESTORE/COLECOES/comercial.md e 03_APLICACAO_WEB/17_COMERCIAL.md. Os dados vieram da
// pasta CRM LEDUR do Friday (quadros Negócios privados/públicos 2025/2026, Projetos Privados/Públicos e Contatos).

export const SEGMENTOS = [
  { id: 'privado', rotulo: 'Privado' },
  { id: 'publico', rotulo: 'Público' },
] as const;
export type Segmento = (typeof SEGMENTOS)[number]['id'];

export const TIPOS_NEGOCIO = [
  { id: 'negocio', rotulo: 'Negócio' },
  { id: 'projeto', rotulo: 'Projeto' },
] as const;
export type TipoNegocio = (typeof TIPOS_NEGOCIO)[number]['id'];

export type SituacaoEtapa = 'aberto' | 'ganho' | 'perdido';

// Etapas do funil, na ordem. "Licitado" só existe no público; o resto vale para os dois segmentos.
export const ETAPAS = [
  { id: 'lead', rotulo: 'Lead', cor: '#5B7C99', situacao: 'aberto' },
  { id: 'qualificacao', rotulo: 'Qualificação', cor: '#4E83AA', situacao: 'aberto' },
  { id: 'contato_feito', rotulo: 'Contato feito', cor: '#2F6B98', situacao: 'aberto' },
  { id: 'projeto_basico', rotulo: 'Projeto básico', cor: '#3A6EA5', situacao: 'aberto' },
  { id: 'orcamentacao', rotulo: 'Orçamentação', cor: '#C9822B', situacao: 'aberto' },
  { id: 'apresentacao', rotulo: 'Apresentação', cor: '#E79A25', situacao: 'aberto' },
  { id: 'proposta_enviada', rotulo: 'Proposta enviada', cor: '#1E405B', situacao: 'aberto' },
  { id: 'licitado', rotulo: 'Licitado', cor: '#12293B', situacao: 'aberto' },
  { id: 'ganho', rotulo: 'Ganho', cor: '#2E9D6F', situacao: 'ganho' },
  { id: 'perdido', rotulo: 'Perdido', cor: '#C13B3B', situacao: 'perdido' },
  { id: 'pos_venda', rotulo: 'Pós-venda', cor: '#23805A', situacao: 'ganho' },
] as const satisfies ReadonlyArray<{ id: string; rotulo: string; cor: string; situacao: SituacaoEtapa }>;
export type Etapa = (typeof ETAPAS)[number]['id'];

export const PRIORIDADES = [
  { id: 'critico', rotulo: 'Crítico', cor: '#C13B3B' },
  { id: 'muito_alta', rotulo: 'Muito alta', cor: '#D2612E' },
  { id: 'alta', rotulo: 'Alta', cor: '#E79A25' },
  { id: 'media', rotulo: 'Média', cor: '#2F6B98' },
  { id: 'baixa', rotulo: 'Baixa', cor: '#5B7C99' },
] as const;
export type Prioridade = (typeof PRIORIDADES)[number]['id'];

// Origem do negócio: junta "Fonte do Lead" (privados) e "Canal de aquisição" (públicos e projetos) do Friday.
export const ORIGENS = [
  { id: 'indicacao', rotulo: 'Indicação' },
  { id: 'cliente', rotulo: 'Cliente da casa' },
  { id: 'obra_executada', rotulo: 'Obra já executada' },
  { id: 'instagram', rotulo: 'Instagram' },
  { id: 'redes_sociais', rotulo: 'Redes sociais' },
  { id: 'google', rotulo: 'Google' },
  { id: 'site', rotulo: 'Internet/site' },
  { id: 'projeto_terceiros', rotulo: 'Projeto de terceiros' },
  { id: 'feiras', rotulo: 'Feiras e eventos' },
  { id: 'visita', rotulo: 'Visita presencial' },
  { id: 'mala_direta', rotulo: 'Mala direta' },
  { id: 'outros', rotulo: 'Outros' },
] as const;
export type Origem = (typeof ORIGENS)[number]['id'];

export const MOTIVOS_PERDA = [
  { id: 'preco', rotulo: 'Preço' },
  { id: 'outra_empresa', rotulo: 'Fechou com outra empresa' },
  { id: 'nao_executou', rotulo: 'Optou por não executar' },
  { id: 'demora_follow', rotulo: 'Demora no follow-up' },
  { id: 'produto', rotulo: 'Não gostou do produto' },
  { id: 'outros', rotulo: 'Outros' },
] as const;
export type MotivoPerda = (typeof MOTIVOS_PERDA)[number]['id'];

export const TIPOS_CONTATO = [
  { id: 'lead_qualificado', rotulo: 'Lead qualificado' },
  { id: 'cliente', rotulo: 'Cliente' },
  { id: 'parceiro', rotulo: 'Parceiro' },
  { id: 'fornecedor', rotulo: 'Fornecedor' },
] as const;
export type TipoContato = (typeof TIPOS_CONTATO)[number]['id'];

export const CATEGORIAS_CONTATO = [
  { id: 'particular', rotulo: 'Particular' },
  { id: 'montador', rotulo: 'Montador' },
] as const;
export type CategoriaContato = (typeof CATEGORIAS_CONTATO)[number]['id'];

export const GRUPOS_ARQUIVO = [
  { id: 'referencias', rotulo: 'Referências' },
  { id: 'projeto', rotulo: 'Projeto pronto' },
  { id: 'outros', rotulo: 'Outros' },
] as const;
export type GrupoArquivo = (typeof GRUPOS_ARQUIVO)[number]['id'];

export type PessoaRef = { uid: string; nome: string };

export type ArquivoNegocio = { path: string; nome: string; contentType: string; bytes: number; grupo: GrupoArquivo };

export type Negocio = {
  id: string;
  titulo: string;
  cliente: string;
  segmento: Segmento;
  tipo: TipoNegocio;
  etapa: Etapa;
  responsaveis: string[]; // UIDs de funcionarios (o primeiro é o principal)
  prioridade: Prioridade | null;
  origem: Origem | null;
  valor: number | null;
  metragem: number | null;
  dataCriacao: string; // AAAA-MM-DD
  dataFechamento: string | null; // AAAA-MM-DD
  motivoPerda: MotivoPerda | null;
  contatoIds: string[];
  arquivos: ArquivoNegocio[];
  origemFriday: { quadroId: number; itemId: number; quadro?: string } | null;
  criadoPor: PessoaRef | null;
  atualizadoPor: PessoaRef | null;
  atualizadoEm: Date | null;
  excluidoEm: Date | null;
  excluidoPor: PessoaRef | null;
};

export type Contato = {
  id: string;
  nome: string;
  tipo: TipoContato | null;
  categoria: CategoriaContato | null;
  empresa: string;
  cargo: string;
  email: string;
  telefone: string;
  notas: string;
  excluidoEm: Date | null;
};

// ---------------------------------------------------------------- rótulos

const porId = <T extends { id: string }>(lista: readonly T[]) => (id: string | null | undefined) => lista.find((item) => item.id === id) ?? null;
export const etapa = porId(ETAPAS);
export const prioridade = porId(PRIORIDADES);
export const origem = porId(ORIGENS);
export const motivoPerda = porId(MOTIVOS_PERDA);
export const tipoContato = porId(TIPOS_CONTATO);
export const categoriaContato = porId(CATEGORIAS_CONTATO);
export const rotuloSegmento = (id: Segmento) => SEGMENTOS.find((s) => s.id === id)?.rotulo ?? id;
export const rotuloTipo = (id: TipoNegocio) => TIPOS_NEGOCIO.find((s) => s.id === id)?.rotulo ?? id;

/** Etapas mostradas no funil de um segmento (sem filtro de segmento, todas). */
export function etapasDoSegmento(segmento: Segmento | 'todos') {
  return ETAPAS.filter((e) => segmento !== 'privado' || e.id !== 'licitado');
}

export const situacao = (n: Pick<Negocio, 'etapa'>): SituacaoEtapa => etapa(n.etapa)?.situacao ?? 'aberto';

// ---------------------------------------------------------------- cálculos

const DIA = 24 * 60 * 60 * 1000;
const diaUtc = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};

/** Hoje em AAAA-MM-DD no horário de Brasília (UTC-3, sem horário de verão). */
export function hojeBrasilia(agora = new Date()): string {
  return new Date(agora.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const dataValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(diaUtc(v));

/** Dias do negócio: da criação ao fechamento (ganho ou perdido) ou até hoje, se está aberto. */
export function duracaoDias(n: Pick<Negocio, 'dataCriacao' | 'dataFechamento' | 'etapa'>, hoje: string): number | null {
  if (!dataValida(n.dataCriacao)) return null;
  const fim = situacao(n) !== 'aberto' ? n.dataFechamento : hoje;
  if (!dataValida(fim)) return null;
  return Math.max(0, Math.round((diaUtc(fim) - diaUtc(n.dataCriacao)) / DIA));
}

export function valorM2(n: Pick<Negocio, 'valor' | 'metragem'>): number | null {
  return n.valor != null && n.metragem ? n.valor / n.metragem : null;
}

export const anoDoNegocio = (n: Pick<Negocio, 'dataCriacao'>) => (dataValida(n.dataCriacao) ? Number(n.dataCriacao.slice(0, 4)) : null);

export function anosDisponiveis(negocios: Pick<Negocio, 'dataCriacao'>[]): number[] {
  return [...new Set(negocios.map(anoDoNegocio).filter((a): a is number => a !== null))].sort((a, b) => b - a);
}

export type FiltroNegocios = {
  ano: number | 'todos';
  segmento: Segmento | 'todos';
  tipo: TipoNegocio | 'todos';
  responsavelUid: string | 'todos';
  busca: string;
  lixeira: boolean;
};

export const FILTRO_INICIAL: FiltroNegocios = { ano: 'todos', segmento: 'todos', tipo: 'todos', responsavelUid: 'todos', busca: '', lixeira: false };

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarNegocios(negocios: Negocio[], f: FiltroNegocios): Negocio[] {
  const busca = semAcento(f.busca.trim());
  return negocios.filter((n) => Boolean(n.excluidoEm) === f.lixeira
    && (f.ano === 'todos' || anoDoNegocio(n) === f.ano)
    && (f.segmento === 'todos' || n.segmento === f.segmento)
    && (f.tipo === 'todos' || n.tipo === f.tipo)
    && (f.responsavelUid === 'todos' || (f.responsavelUid === '' ? !n.responsaveis.length : n.responsaveis.includes(f.responsavelUid)))
    && (!busca || semAcento(`${n.titulo} ${n.cliente}`).includes(busca)));
}

type Soma = { quantidade: number; valor: number };
const soma = (lista: Negocio[]): Soma => ({ quantidade: lista.length, valor: lista.reduce((t, n) => t + (n.valor ?? 0), 0) });

export type LinhaPainel = { id: string; rotulo: string; cor?: string; quantidade: number; valor: number; ganhos?: number };

export type ResumoPainel = {
  total: Soma;
  abertos: Soma;
  propostas: Soma; // Proposta enviada + Licitado
  ganhos: Soma;
  perdidos: Soma;
  conversao: number | null; // ganhos / (ganhos + perdidos)
  ticketMedio: number | null; // valor médio dos ganhos com valor
  cicloMedio: { dias: number; base: number } | null; // ganhos com data de fechamento
  porEtapa: LinhaPainel[];
  porMotivo: LinhaPainel[];
  porOrigem: LinhaPainel[];
  porResponsavel: LinhaPainel[];
  porSegmento: LinhaPainel[];
  porMes: LinhaPainel[]; // negócios criados por mês (AAAA-MM)
};

function agrupar(lista: Negocio[], chave: (n: Negocio) => string, rotulo: (id: string) => string, cor?: (id: string) => string | undefined): LinhaPainel[] {
  const grupos = new Map<string, Negocio[]>();
  for (const n of lista) grupos.set(chave(n), [...(grupos.get(chave(n)) ?? []), n]);
  return [...grupos.entries()]
    .map(([id, itens]) => ({ id, rotulo: rotulo(id), cor: cor?.(id), ...soma(itens), ganhos: itens.filter((n) => situacao(n) === 'ganho').length }))
    .sort((a, b) => b.quantidade - a.quantidade || b.valor - a.valor);
}

/** Indicadores do Painel para os negócios já filtrados (fora da lixeira). `nomes` traduz o UID do responsável. */
export function resumoPainel(negocios: Negocio[], segmento: Segmento | 'todos', nomes: Record<string, string> = {}): ResumoPainel {
  const abertos = negocios.filter((n) => situacao(n) === 'aberto');
  const ganhos = negocios.filter((n) => situacao(n) === 'ganho');
  const perdidos = negocios.filter((n) => situacao(n) === 'perdido');
  const comValor = ganhos.filter((n) => n.valor != null);
  const ciclos = ganhos.map((n) => duracaoDias(n, '')).filter((d): d is number => d !== null);
  return {
    total: soma(negocios),
    abertos: soma(abertos),
    propostas: soma(negocios.filter((n) => n.etapa === 'proposta_enviada' || n.etapa === 'licitado')),
    ganhos: soma(ganhos),
    perdidos: soma(perdidos),
    conversao: ganhos.length + perdidos.length ? ganhos.length / (ganhos.length + perdidos.length) : null,
    ticketMedio: comValor.length ? soma(comValor).valor / comValor.length : null,
    cicloMedio: ciclos.length ? { dias: Math.round(ciclos.reduce((t, d) => t + d, 0) / ciclos.length), base: ciclos.length } : null,
    porEtapa: etapasDoSegmento(segmento).map((e) => ({ id: e.id, rotulo: e.rotulo, cor: e.cor, ...soma(negocios.filter((n) => n.etapa === e.id)) })),
    porMotivo: agrupar(perdidos, (n) => n.motivoPerda ?? '', (id) => motivoPerda(id)?.rotulo ?? 'Sem motivo informado'),
    porOrigem: agrupar(negocios, (n) => n.origem ?? '', (id) => origem(id)?.rotulo ?? 'Sem origem informada'),
    // Negócio com mais de um responsável conta para cada um.
    porResponsavel: agrupar(negocios.flatMap((n) => (n.responsaveis.length ? n.responsaveis : ['']).map((uid) => ({ ...n, responsaveis: [uid] }))),
      (n) => n.responsaveis[0], (id) => (id ? nomes[id] ?? 'Pessoa sem cadastro ativo' : 'Sem responsável')),
    porSegmento: SEGMENTOS.map((s) => {
      const itens = negocios.filter((n) => n.segmento === s.id);
      return { id: s.id, rotulo: s.rotulo, ...soma(itens), ganhos: itens.filter((n) => situacao(n) === 'ganho').length };
    }),
    porMes: agrupar(negocios.filter((n) => dataValida(n.dataCriacao)), (n) => n.dataCriacao.slice(0, 7), (id) => mesAno(id))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const mesAno = (aaaaMm: string) => `${MESES[Number(aaaaMm.slice(5, 7)) - 1] ?? '?'}/${aaaaMm.slice(2, 4)}`;

// ---------------------------------------------------------------- formatação

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const formatarMoeda = (v: number | null | undefined) => (v == null ? '—' : moeda.format(v));

/** R$ curto para os cartões: 1,2 mi, 350 mil. */
export function formatarMoedaCurta(v: number | null | undefined): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return formatarMoeda(v);
}

export const formatarData = (iso: string | null | undefined) => (dataValida(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const formatarPercentual = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

// ---------------------------------------------------------------- formulários

export type NegocioForm = {
  titulo: string;
  cliente: string;
  segmento: Segmento;
  tipo: TipoNegocio;
  etapa: Etapa;
  responsaveis: string[];
  prioridade: Prioridade | '';
  origem: Origem | '';
  valor: string;
  metragem: string;
  dataCriacao: string;
  dataFechamento: string;
  motivoPerda: MotivoPerda | '';
  contatoIds: string[];
};

export const negocioFormVazio = (hoje: string, segmento: Segmento = 'privado'): NegocioForm => ({
  titulo: '', cliente: '', segmento, tipo: 'negocio', etapa: 'lead', responsaveis: [], prioridade: '', origem: '',
  valor: '', metragem: '', dataCriacao: hoje, dataFechamento: '', motivoPerda: '', contatoIds: [],
});

const numeroTexto = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));

export const negocioParaForm = (n: Negocio): NegocioForm => ({
  titulo: n.titulo, cliente: n.cliente, segmento: n.segmento, tipo: n.tipo, etapa: n.etapa, responsaveis: n.responsaveis,
  prioridade: n.prioridade ?? '', origem: n.origem ?? '', valor: numeroTexto(n.valor), metragem: numeroTexto(n.metragem),
  dataCriacao: n.dataCriacao, dataFechamento: n.dataFechamento ?? '', motivoPerda: n.motivoPerda ?? '', contatoIds: n.contatoIds,
});

/** Número digitado em pt-BR ("1.250.000,50" ou "1250000.5"); vazio = null; inválido = NaN. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN;
}

export function validarNegocio(f: NegocioForm): string | null {
  if (!f.titulo.trim()) return 'Informe o nome do negócio.';
  if (f.titulo.trim().length > 200) return 'O nome passa de 200 caracteres.';
  if (Number.isNaN(lerNumero(f.valor))) return 'Valor inválido: use só números, como 250.000,00.';
  if (Number.isNaN(lerNumero(f.metragem))) return 'Metragem inválida: use só números.';
  if (!dataValida(f.dataCriacao)) return 'Informe a data de criação.';
  if (f.dataFechamento && !dataValida(f.dataFechamento)) return 'Data de fechamento inválida.';
  if (f.dataFechamento && f.dataFechamento < f.dataCriacao) return 'O fechamento não pode ser antes da criação.';
  if (f.segmento === 'privado' && f.etapa === 'licitado') return '"Licitado" é só de negócio público.';
  return null;
}

/** Campos de comercial-negocios vindos do formulário. Fechar (ganho/perdido) sem data usa hoje; reabrir limpa o motivo. */
export function camposDoNegocio(f: NegocioForm, hoje: string) {
  const sit = situacao({ etapa: f.etapa });
  return {
    titulo: f.titulo.trim(),
    cliente: f.cliente.trim() || null,
    segmento: f.segmento,
    tipo: f.tipo,
    etapa: f.etapa,
    responsaveis: f.responsaveis,
    prioridade: f.prioridade || null,
    origem: f.origem || null,
    valor: lerNumero(f.valor),
    metragem: lerNumero(f.metragem),
    dataCriacao: f.dataCriacao,
    dataFechamento: f.dataFechamento || (sit !== 'aberto' ? hoje : null),
    motivoPerda: sit === 'perdido' ? f.motivoPerda || null : null,
    contatoIds: f.contatoIds,
  };
}

/** Mudança de etapa no funil (arrastar): mesmas regras de fechamento do formulário. */
export function camposDaEtapa(n: Negocio, nova: Etapa, hoje: string) {
  const sit = situacao({ etapa: nova });
  return {
    etapa: nova,
    dataFechamento: sit === 'aberto' ? null : n.dataFechamento ?? hoje,
    motivoPerda: sit === 'perdido' ? n.motivoPerda : null,
  };
}

export type ContatoForm = {
  nome: string;
  tipo: TipoContato | '';
  categoria: CategoriaContato | '';
  empresa: string;
  cargo: string;
  email: string;
  telefone: string;
  notas: string;
};

export const contatoFormVazio = (): ContatoForm => ({ nome: '', tipo: '', categoria: '', empresa: '', cargo: '', email: '', telefone: '', notas: '' });

export const contatoParaForm = (c: Contato): ContatoForm => ({
  nome: c.nome, tipo: c.tipo ?? '', categoria: c.categoria ?? '', empresa: c.empresa, cargo: c.cargo, email: c.email, telefone: c.telefone, notas: c.notas,
});

export function validarContato(f: ContatoForm): string | null {
  if (!f.nome.trim()) return 'Informe o nome.';
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return 'E-mail inválido.';
  if (f.notas.length > 5000) return 'As notas passam de 5.000 caracteres.';
  return null;
}

export const camposDoContato = (f: ContatoForm) => ({
  nome: f.nome.trim(),
  tipo: f.tipo || null,
  categoria: f.categoria || null,
  empresa: f.empresa.trim() || null,
  cargo: f.cargo.trim() || null,
  email: f.email.trim() || null,
  telefone: f.telefone.trim() || null,
  notas: f.notas.trim() || null,
});
