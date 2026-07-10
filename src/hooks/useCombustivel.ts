import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/combustivelApi';
import { saveCombustivel } from '../services/combustivelFirestore';
import { useAuth } from '../contexts/AuthContext';
import type { Registro } from '../types';

function mapRegistro(raw: any): Registro {
  return {
    ...raw,
    km: raw?.km ?? null,
  } as Registro;
}

export default function useCombustivel() {
  const [data, setData] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { currentUser } = useAuth();

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

  const create = useCallback(async (values: Omit<Registro, 'id'>) => {
    setLoading(true);
    try {
      if (!currentUser?.email) {
        throw new Error('Usuário não autenticado');
      }
      const res = await saveCombustivel({ ...values, email: currentUser.email });
      setData((d) => [...d, mapRegistro(res)]);
      setError(null);
      return mapRegistro(res);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentUser?.email]);

  const update = useCallback(async (id: string, values: Partial<Registro>) => {
    setLoading(true);
    try {
      const res = await api.update(id, values);
      const mapped = mapRegistro(res);
      setData(d => d.map(r => (r.id === id ? mapped : r)));
      setError(null);
      return mapped;
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

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

  return { data, loading, error, load, create, update, remove };
}
