import { useCallback, useEffect, useState } from 'react';
import * as api from '../services/combustivelApi';
import type { Registro } from '../types';

export default function useCombustivel() {
  const [data, setData] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getAll();
      setData(result as Registro[]);
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
      const res = await api.create(values);
      setData(d => [...d, res as Registro]);
      setError(null);
      return res;
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar');
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (id: string, values: Partial<Registro>) => {
    setLoading(true);
    try {
      const res = await api.update(id, values);
      setData(d => d.map(r => (r.id === id ? (res as Registro) : r)));
      setError(null);
      return res;
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