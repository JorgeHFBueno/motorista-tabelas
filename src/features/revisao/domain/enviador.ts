// Fila de envio das revisões salvas, igual ao ManutencaoEnviador do app (manutencao/data/manutencao_envio.dart): de cada
// registro só a revisão mais nova vai; envia as fotos pulando as que já existem, grava o documento numa transação e
// então tira da fila as revisões até ela. Registro já fechado no servidor: recusada, fica no aparelho e não é tentada de
// novo. Permissão negada: continua tentando, com aviso. O armazenamento e o destino são injetados (falsos nos testes).
import { esperaApos } from '../../checklist-mecanico/domain/enviador';
import { arquivosParaEnvio } from './documento';
import { statusDe, type RevisaoPendente, type RevisaoRegistro } from './registro';

export interface ArmazenamentoRevisao {
  listarPendentes(): Promise<RevisaoPendente[]>;
  salvarPendente(p: RevisaoPendente): Promise<void>;
  /** Tira da fila as revisões do registro até `revisao`, inclusive. */
  removerPendentesAte(id: string, revisao: number): Promise<void>;
  lerArquivo(chave: string): Promise<Blob | null>;
  carregarRegistro(id: string): Promise<RevisaoRegistro | null>;
  /** Apaga a cópia do registro e as fotos dele do aparelho. */
  removerRegistro(id: string): Promise<void>;
}

export interface DestinoRevisao {
  arquivoExiste(caminho: string): Promise<boolean>;
  enviarArquivo(caminho: string, arquivo: Blob): Promise<void>;
  /** Grava `manutencoes-v2/{id}` e o medidor numa transação; revisão igual ou mais velha que a do servidor não muda nada. Lança `RevisaoJaFechada`. */
  gravar(p: RevisaoPendente): Promise<void>;
}

export const MENSAGEM_JA_FECHADA = 'Não enviada: a revisão já foi fechada.';
export const MENSAGEM_SEM_PERMISSAO = 'Não enviada: o servidor negou a permissão. Avise o adm2.';

/** O servidor já tem o registro fechado (ex.: fechado em outro aparelho). */
export class RevisaoJaFechada extends Error {
  constructor() {
    super(MENSAGEM_JA_FECHADA);
  }
}

/** Firestore `permission-denied` ou Storage `storage/unauthorized`. */
const permissaoNegada = (erro: unknown) => {
  const code = (erro as { code?: unknown } | null)?.code;
  return code === 'permission-denied' || code === 'storage/unauthorized';
};

export type EstadoEnvioRevisao = {
  /** Registros de quem está logado com revisão ainda não enviada (sem as recusadas). */
  pendentes: number;
  /** Recusadas ou tentando com aviso. */
  naoEnviadas: number;
  enviando: boolean;
};

type Relogio = { agora: () => Date; agendar: (acao: () => void, ms: number) => unknown; cancelar: (id: unknown) => void };

const relogioReal: Relogio = {
  agora: () => new Date(),
  agendar: (acao, ms) => setTimeout(acao, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export class EnviadorRevisao {
  private estado: EstadoEnvioRevisao = { pendentes: 0, naoEnviadas: 0, enviando: false };
  private ouvintes = new Set<() => void>();
  private repetir = false;
  private proxima: unknown = null;
  private readonly armazenamento: ArmazenamentoRevisao;
  private readonly destino: DestinoRevisao;
  private readonly uidAtual: () => string | null;
  private readonly relogio: Relogio;

  constructor(opcoes: { armazenamento: ArmazenamentoRevisao; destino: DestinoRevisao; uidAtual: () => string | null; relogio?: Partial<Relogio> }) {
    this.armazenamento = opcoes.armazenamento;
    this.destino = opcoes.destino;
    this.uidAtual = opcoes.uidAtual;
    this.relogio = { ...relogioReal, ...opcoes.relogio };
  }

  obterEstado = (): EstadoEnvioRevisao => this.estado;

  assinar = (ouvinte: () => void): (() => void) => {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  };

  private mudar(parcial: Partial<EstadoEnvioRevisao>) {
    this.estado = { ...this.estado, ...parcial };
    for (const ouvinte of this.ouvintes) ouvinte();
  }

  /** A revisão mais nova de cada registro de quem está logado, pela hora do "Salvar" (as Rules só aceitam a de quem salvou). */
  async pendentesDoUsuario(): Promise<RevisaoPendente[]> {
    const uid = this.uidAtual();
    if (!uid) return [];
    const maisNovas = new Map<string, RevisaoPendente>();
    for (const p of await this.armazenamento.listarPendentes()) {
      if (p.autor.uid !== uid) continue;
      const atual = maisNovas.get(p.registro.id);
      if (!atual || p.registro.revisao > atual.registro.revisao) maisNovas.set(p.registro.id, p);
    }
    return [...maisNovas.values()].sort((a, b) => a.salvoEm.getTime() - b.salvoEm.getTime());
  }

  private async contar(lista?: RevisaoPendente[]) {
    const todas = lista ?? await this.pendentesDoUsuario();
    this.mudar({ pendentes: todas.filter((p) => p.recusa == null).length, naoEnviadas: todas.filter((p) => p.recusa != null || p.aviso != null).length });
  }

  /** Atualiza a contagem sem enviar. */
  async atualizarContagem(): Promise<void> {
    if (!this.estado.enviando) await this.contar();
  }

  /** Envia o que estiver pendente. Sem `forcar`, respeita a espera entre tentativas; chamadas durante um envio viram nova rodada. */
  async enviarPendentes({ forcar = false } = {}): Promise<void> {
    if (this.estado.enviando) {
      this.repetir = true;
      return;
    }
    if (this.proxima != null) this.relogio.cancelar(this.proxima);
    this.proxima = null;
    this.mudar({ enviando: true });
    try {
      do {
        this.repetir = false;
        const lista = await this.pendentesDoUsuario();
        // Revisões mais velhas do mesmo registro ficaram obsoletas.
        for (const p of lista) if (p.registro.revisao > 1) await this.armazenamento.removerPendentesAte(p.registro.id, p.registro.revisao - 1);
        await this.contar(lista);
        for (const p of lista) {
          if (p.recusa != null) continue;
          if (!forcar && p.proximaTentativa && p.proximaTentativa > this.relogio.agora()) continue;
          await this.enviar(p);
        }
        forcar = false;
      } while (this.repetir);
    } finally {
      this.mudar({ enviando: false });
      await this.agendarProxima();
    }
  }

  private async enviar(inicial: RevisaoPendente): Promise<void> {
    let p = inicial;
    try {
      for (const { caminho, local } of arquivosParaEnvio(p)) {
        if (p.enviados.includes(caminho)) continue;
        if (!(await this.destino.arquivoExiste(caminho))) {
          const arquivo = await this.armazenamento.lerArquivo(local);
          if (!arquivo) throw new Error(`Arquivo ${local} não está mais no aparelho.`);
          await this.destino.enviarArquivo(caminho, arquivo);
        }
        p = { ...p, enviados: [...p.enviados, caminho] };
        await this.armazenamento.salvarPendente(p);
      }
      await this.destino.gravar(p);
      await this.armazenamento.removerPendentesAte(p.registro.id, p.registro.revisao);
      if (statusDe(p.registro) === 'fechada') {
        // Fechado e enviado: a cópia do aparelho e as fotos não servem mais (salvo uma revisão mais nova, de outro jeito impossível).
        const local = await this.armazenamento.carregarRegistro(p.registro.id);
        if (!local || local.revisao <= p.registro.revisao) await this.armazenamento.removerRegistro(p.registro.id);
      }
    } catch (error) {
      if (error instanceof RevisaoJaFechada) {
        await this.armazenamento.salvarPendente({ ...p, recusa: MENSAGEM_JA_FECHADA });
        return;
      }
      console.warn(`Revisão ${p.registro.id}: envio falhou`, error);
      const tentativas = p.tentativas + 1;
      await this.armazenamento.salvarPendente({
        ...p,
        tentativas,
        proximaTentativa: new Date(this.relogio.agora().getTime() + esperaApos(tentativas)),
        aviso: permissaoNegada(error) ? MENSAGEM_SEM_PERMISSAO : null,
      });
    }
  }

  private async agendarProxima(): Promise<void> {
    const lista = await this.pendentesDoUsuario();
    await this.contar(lista);
    const aEnviar = lista.filter((p) => p.recusa == null);
    if (aEnviar.length === 0) return;
    const agora = this.relogio.agora().getTime();
    const primeira = Math.min(...aEnviar.map((p) => (p.proximaTentativa ?? this.relogio.agora()).getTime()));
    this.proxima = this.relogio.agendar(() => {
      this.proxima = null;
      void this.enviarPendentes();
    }, Math.max(0, primeira - agora));
  }
}
