import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/combustivelApi';
import type { Registro } from '../types';
import { normalizarMovimentoCombustivel } from '../services/combustivel-normalizer';

function mapRegistro(raw: any): Registro {
  return normalizarMovimentoCombustivel(raw ?? {}, raw?.id ?? '') as Registro;
}

export default function useCombustivel() {
  const [data, setData] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getAll();
      setData(Array.isArray(result) ? result.map(mapRegistro) : []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  // No create/update here: the old form wrote legacy fields (li, lf, qa, para_quem) into V2 records.
  const remove = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await api.remove(id);
      setData(d => d.filter(r => r.id !== id));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao remover');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, load, remove };
}
