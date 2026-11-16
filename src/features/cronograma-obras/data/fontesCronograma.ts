import { createContext } from "react";
import { updateLoteStatus, type LoteStatus, type LoteStatusCode } from "../../../services/loteStatusService";
import type { AlocacaoFirestore, CreateAlocacao, UpdateAlocacao } from "./cronogramaFirestore";
import type { MestreFirestore, MestresLoadResult } from "./mestresFirestore";
import type { ContratosChange } from "./source/contratosRealtime";

/**
 * De onde o CronoObra lê e para onde grava. Em `/engenharia/cronograma` é o Firestore (`fontesFirestore.ts`);
 * um teste em `/testes` pode passar dados fictícios em memória (nada é salvo).
 */
export interface FontesCronograma {
  contratos: { subscribe(onChanges: (changes: ContratosChange[]) => void, onError: (cause: Error) => void): () => void };
  mestres: {
    carregar(): Promise<MestresLoadResult>;
    criar(nome: string, cor: string, mestresAtuais: ReadonlyArray<{ id: string; nome: string }>): Promise<MestreFirestore>;
  };
  alocacoes: {
    subscribeAlocacoes(onData: (alocacoes: AlocacaoFirestore[]) => void, onError: (cause: Error) => void): () => void;
    createAlocacaoReference(id?: string): { id: string };
    createAlocacao(input: CreateAlocacao, reference?: { id: string }): Promise<string>;
    updateAlocacao(id: string, patch: UpdateAlocacao): Promise<void>;
    deleteAlocacao(id: string): Promise<void>;
  };
  gravarPrioridadeLote(contratoId: string, loteId: string, prioridade: number): Promise<void>;
  gravarStatusLote(contratoId: string, loteId: string, status: LoteStatusCode): Promise<LoteStatus>;
}

/** Gravação do Status do LOTE usada pelo LoteStatusControl (padrão: a Function do Friday). */
export const GravarStatusLoteContext = createContext<FontesCronograma["gravarStatusLote"]>(
  (contratoId, loteId, status) => updateLoteStatus(contratoId, loteId, status),
);
