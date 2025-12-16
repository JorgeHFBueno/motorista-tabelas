import { useCallback, useEffect, useState } from 'react';
import { createUser as apiCreateUser, deleteUser as apiDeleteUser, listUsers,
  type AdminUser, type CreateAdminUserInput } from '../services/adminUsersApi';

export default function useAdminUsers() {
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
    void loadUsers();
  }, [loadUsers]);

  const createUser = useCallback(
    async (input: CreateAdminUserInput) => {
      const created = await apiCreateUser(input);
      await loadUsers();
      return created;
    },
    [loadUsers],
  );

  const deleteUser = useCallback(
    async (uid: string) => {
      await apiDeleteUser(uid);
      await loadUsers();
    },
    [loadUsers],
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