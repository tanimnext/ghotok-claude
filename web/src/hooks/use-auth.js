'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { hasSessionHint } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints';

export const AUTH_KEY = ['auth', 'me'];

const noSubscribe = () => () => {};

/**
 * Whether a session cookie hint exists: true/false in the browser, null during
 * server rendering and hydration (so both render the same "loading" state).
 */
function useSessionHint() {
  return useSyncExternalStore(noSubscribe, hasSessionHint, () => null);
}

/** The signed-in member, or null. `isLoading` is true until we know. */
export function useAuth() {
  const hint = useSessionHint();
  const query = useQuery({
    queryKey: AUTH_KEY,
    queryFn: async () => {
      try {
        return (await authApi.me()).user;
      } catch (err) {
        if (err.status === 401 || err.status === 403) return null;
        throw err;
      }
    },
    enabled: hint === true,
    staleTime: 60_000,
  });
  if (hint === null) return { user: null, isLoading: true, refetch: query.refetch };
  if (hint === false) return { user: query.data ?? null, isLoading: false, refetch: query.refetch };
  return { user: query.data ?? null, isLoading: query.isLoading, refetch: query.refetch };
}

/** Stores a freshly signed-in user so every component updates at once. */
export function useSetAuthUser() {
  const queryClient = useQueryClient();
  return (user) => queryClient.setQueryData(AUTH_KEY, user);
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(AUTH_KEY, null);
      router.push('/');
      router.refresh();
    },
  });
}
