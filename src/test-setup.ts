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

Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
  configurable: true,
  value: function () {
    this.open = true;
    this.querySelector('[autofocus]')?.focus();
  },
});
Object.defineProperty(HTMLDialogElement.prototype, 'close', {
  configurable: true,
  value: function () {
    this.open = false;
  },
});

// jsdom has no PointerEvent constructor. Real gestures are covered by Playwright.
if (!globalThis.PointerEvent) {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  Object.defineProperty(globalThis, 'PointerEvent', { value: PointerEventStub });
}
