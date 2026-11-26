import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizarAtividade, type AtividadeV2 } from '../services/atividade-normalizer';

export type Atividade = AtividadeV2;

/** Sem data inicial, os Registros leem só 90 dias (a coleção inteira passava de 1.600 documentos a cada abertura). */
export const DIAS_PADRAO = 90;

/** Início do período sem data inicial: os 90 dias que terminam na data final (ou hoje), à meia-noite local. */
export function inicioPadrao(fim: Date = new Date()): Date {
  return new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - (DIAS_PADRAO - 1));
}

/**
 * Saídas e chegadas do período (datas AAAA-MM-DD; sem data inicial, os 90 dias até a data final ou hoje), lidas com
 * filtro em `data`. Depois da primeira leitura, espera a data parar de mudar: digitar o ano passa por datas como
 * 0002-..., que leriam a coleção toda.
 */
export default function useAtividade(dataInicial: string, dataFinal: string) {
  const [data, setData] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(false);
  const primeira = useRef(true);

  useEffect(() => {
    let vivo = true;
    const fim = dataFinal ? new Date(`${dataFinal}T23:59:59.999`) : null;
    const inicio = dataInicial ? new Date(`${dataInicial}T00:00:00`) : inicioPadrao(fim ?? new Date());
    if (Number.isNaN(inicio.getTime()) || (fim && Number.isNaN(fim.getTime()))) return undefined;
    const espera = setTimeout(async () => {
      setLoading(true);
      try {
        const condicoes = [where('data', '>=', inicio), ...(fim ? [where('data', '<=', fim)] : [])];
        const snapshot = await getDocs(query(collection(db, 'atividades'), ...condicoes));
        if (vivo) setData(snapshot.docs.map((doc) => normalizarAtividade(doc.data(), doc.id)));
      } finally {
        if (vivo) setLoading(false);
      }
    }, primeira.current ? 0 : 500);
    primeira.current = false;
    return () => {
      vivo = false;
      clearTimeout(espera);
    };
  }, [dataInicial, dataFinal]);

  return { data, loading };
}
