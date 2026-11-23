import { useEffect, useState } from 'react';
import { observarVeiculos, observarViagens } from './data/rastreadorFirestore';
import type { VeiculoRastreador, ViagemRastreador } from './domain/viagem';

export type DadosRastreador = { viagens: ViagemRastreador[] | null; veiculos: VeiculoRastreador[]; erro: string | null };

/** Viagens e estado dos veículos do rastreador, lidos só enquanto a aba está aberta. */
export default function useRastreador(ativo: boolean): DadosRastreador {
  const [viagens, setViagens] = useState<ViagemRastreador[] | null>(null);
  const [veiculos, setVeiculos] = useState<VeiculoRastreador[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return undefined;
    const falhar = (e: Error) => setErro(`Não foi possível ler as viagens do rastreador: ${e.message}`);
    const a = observarViagens(setViagens, falhar);
    const b = observarVeiculos(setVeiculos, falhar);
    return () => { a(); b(); };
  }, [ativo]);

  return { viagens, veiculos, erro };
}
