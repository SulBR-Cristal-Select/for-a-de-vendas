import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Os fixtures assumem outubro de 2026 como mês corrente; só a data é fixada, os temporizadores continuam reais.
vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-27T15:00:00-03:00") });

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
