import { useEffect, useState } from 'react';
import { observarVeiculos, observarViagens } from './data/rastreadorFirestore';
import type { VeiculoRastreador, ViagemRastreador } from './domain/viagem';

export type DadosRastreador = { viagens: ViagemRastreador[] | null; veiculos: VeiculoRastreador[]; erro: string | null };

/** Viagens com saída desde `desde` (dia `AAAA-MM-DD`) e o estado dos veículos, lidos enquanto `ativo`. */
export default function useRastreador(ativo: boolean, desde: string): DadosRastreador {
  const [viagens, setViagens] = useState<ViagemRastreador[] | null>(null);
  const [veiculos, setVeiculos] = useState<VeiculoRastreador[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return undefined;
    const falhar = (e: Error) => setErro(`Não foi possível ler as viagens do rastreador: ${e.message}`);
    const a = observarViagens(new Date(`${desde}T00:00:00`), setViagens, falhar);
    return () => a();
  }, [ativo, desde]);

  useEffect(() => {
    if (!ativo) return undefined;
    return observarVeiculos(setVeiculos, (e) => setErro(`Não foi possível ler os veículos do rastreador: ${e.message}`));
  }, [ativo]);

  return { viagens, veiculos, erro };
}
