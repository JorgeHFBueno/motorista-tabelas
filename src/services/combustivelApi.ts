import { getAuth } from 'firebase/auth';
import { app } from '../firebase';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path: string, options: RequestInit = {}) {
  const auth = getAuth(app);
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Usuário não autenticado');
  const token = await currentUser.getIdToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getAll() {
  return request('/combustivel');
}

export async function create(data: any) {
  return request('/combustivel', { method: 'POST', body: JSON.stringify(data) });
}

export async function update(id: string, data: any) {
  return request(`/combustivel/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export async function remove(id: string) {
  return request(`/combustivel/${id}`, { method: 'DELETE' });
}

export default { getAll, create, update, remove };