export type ClientBootstrapDependencies = {
  hasSSRState: () => boolean;
  hydrate: () => void;
  mount: () => Promise<void>;
};

/** Uma única inicialização por documento; páginas sem estado SSR não podem ser hidratadas. */
export function createClientBootstrap(dependencies: ClientBootstrapDependencies) {
  let started: Promise<void> | undefined;
  return () =>
    (started ??= Promise.resolve().then(() => {
      if (dependencies.hasSSRState()) return dependencies.hydrate();
      return dependencies.mount();
    }));
}
