import { useCallback, useEffect, useState } from 'react';
import { createUser as apiCreateUser, deleteUser as apiDeleteUser, listUsers,
  type AdminUser, type CreateAdminUserInput } from '../services/adminUsersApi';

interface UseAdminUsersOptions {
  loadOnMount?: boolean;
  refreshOnChange?: boolean;
}

export default function useAdminUsers(options: UseAdminUsersOptions = {}) {
  const { loadOnMount = true, refreshOnChange = true } = options;
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listUsers();
      setUsers(data);
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

  const createUser = useCallback(
    async (input: CreateAdminUserInput) => {
      const created = await apiCreateUser(input);
      if (refreshOnChange) {
        await loadUsers();
      }
      return created;
    },
    [loadUsers, refreshOnChange],
  );

  const deleteUser = useCallback(
    async (uid: string) => {
      await apiDeleteUser(uid);
      if (refreshOnChange) {
        await loadUsers();
      }
    },
    [loadUsers, refreshOnChange],
  );

  return {
    users,
    loading,
    error,
    createUser,
    deleteUser,
    reload: loadUsers,
  } as const;
}