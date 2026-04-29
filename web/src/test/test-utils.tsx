import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

interface RouterRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialEntries?: string[];
  // If the component reads route params, mount it under a route path so
  // ``useParams`` returns the expected value.
  routePath?: string;
  queryClient?: QueryClient;
}

/**
 * Render a component wrapped in QueryClientProvider + MemoryRouter.
 *
 * Use ``routePath`` when the component depends on ``useParams`` — the test
 * mounts the element under a single ``Route`` matching that path.
 */
export function renderWithRouter(
  ui: ReactElement,
  {
    initialEntries = ['/'],
    routePath,
    queryClient,
    ...renderOptions
  }: RouterRenderOptions = {},
) {
  const client = queryClient ?? createTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        {routePath ? (
          <Routes>
            <Route path={routePath} element={children} />
          </Routes>
        ) : (
          children
        )}
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient: client };
}
