import '@testing-library/jest-dom';
import { vi } from 'vitest';
import '../i18n/index';

// Recharts uses ResizeObserver which is not available in jsdom
globalThis.ResizeObserver = class ResizeObserver {
  observe() {
    // no-op stub for jsdom
  }
  unobserve() {
    // no-op stub for jsdom
  }
  disconnect() {
    // no-op stub for jsdom
  }
};

// shadcn SidebarProvider uses window.matchMedia which is not available in jsdom
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
