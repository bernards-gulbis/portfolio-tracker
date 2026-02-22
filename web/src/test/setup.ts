import '@testing-library/jest-dom';
import { vi } from 'vitest';
import '../i18n/index';

// Recharts uses ResizeObserver which is not available in jsdom
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));
