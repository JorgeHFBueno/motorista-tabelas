import { useCallback, useEffect, useState } from 'react';
import {
  definirSenha as apiDefinirSenha,
  deleteUser as apiDeleteUser,
  listUsers,
  registerAuthorizedUser as apiRegisterAuthorizedUser,
  updateUser as apiUpdateUser,
  type AdminUser,
  type RegisterAuthorizedUserInput,
  type UpdateAdminUserInput,
} from '../services/adminUsersApi';

interface UseAdminUsersOptions {
  loadOnMount?: boolean;
  refreshOnChange?: boolean;
}

export default function useAdminUsers(options: UseAdminUsersOptions = {}) {
  const { loadOnMount = true, refreshOnChange = true } = options;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(loadOnMount);
  const [error, setError] = useState<Error | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadOnMount) return;
    void loadUsers();
  }, [loadOnMount, loadUsers]);

  const depois = useCallback(async () => { if (refreshOnChange) await loadUsers(); }, [loadUsers, refreshOnChange]);

  const registerAuthorizedUser = useCallback(async (input: RegisterAuthorizedUserInput) => {
    const created = await apiRegisterAuthorizedUser(input);
    await depois();
    return created;
  }, [depois]);

  const updateUser = useCallback(async (input: UpdateAdminUserInput) => {
    const updated = await apiUpdateUser(input);
    if (refreshOnChange) await loadUsers();
    else setUsers((current) => current.map((user) => (user.uid === updated.uid ? updated : user)));
    return updated;
  }, [loadUsers, refreshOnChange]);

  const deleteUser = useCallback(async (uid: string) => {
    await apiDeleteUser(uid);
    await depois();
  }, [depois]);

  const definirSenha = useCallback((uid: string, password: string) => apiDefinirSenha(uid, password), []);

  return { users, loading, error, reload: loadUsers, registerAuthorizedUser, updateUser, deleteUser, definirSenha };
}
