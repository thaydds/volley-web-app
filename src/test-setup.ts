import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver; @dnd-kit observes element sizes,
// and the browser ships it natively, so a minimal stub covers tests only.
class ResizeObserverStub implements ResizeObserver {
  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub;
}
