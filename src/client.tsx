import { StrictMode, startTransition } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { StartClient } from '@tanstack/react-start/client';
import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from './router';
import { createClientBootstrap } from './lib/client-bootstrap';

const global = window as Window & { __sulClientBootstrap?: () => Promise<void>; $_TSR?: unknown };
global.__sulClientBootstrap ??= createClientBootstrap({
  hasSSRState: () => !!global.$_TSR,
  hydrate: () => { startTransition(() => { hydrateRoot(document, <StrictMode><StartClient /></StrictMode>); }); },
  mount: async () => {
    const router = getRouter();
    await router.load();
    startTransition(() => { createRoot(document).render(<StrictMode><RouterProvider router={router} /></StrictMode>); });
  },
});
void global.__sulClientBootstrap();
