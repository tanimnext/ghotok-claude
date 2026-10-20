import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { can, isStaff } from '@ghotok/shared';
import { hasSessionHint } from '@ghotok/shared/api-client';
import { authApi } from '../lib/api.js';

export const AUTH_KEY = ['auth', 'me'];

/** The signed-in staff member, or null. Members without a staff role count as signed out here. */
export function useAuth() {
  const query = useQuery({
    queryKey: AUTH_KEY,
    queryFn: async () => {
      if (!hasSessionHint()) return null;
      try {
        return (await authApi.me()).user;
      } catch (err) {
        if (err.status === 401 || err.status === 403) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
  const user = query.data ?? null;
  return { user, isStaff: !!user && isStaff(user.role), isLoading: query.isLoading };
}

/** True when the signed-in staff member's role has `permission`. */
export function useCan() {
  const { user } = useAuth();
  return (permission) => !!user && can(user.role, permission);
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, null);
    },
  });
}
