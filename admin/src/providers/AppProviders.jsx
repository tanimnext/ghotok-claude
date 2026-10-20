import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { PreferencesProvider } from './PreferencesProvider.jsx';

export function AppProviders({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, error) => (error?.status ?? 500) >= 500 && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>{children}</PreferencesProvider>
    </QueryClientProvider>
  );
}
