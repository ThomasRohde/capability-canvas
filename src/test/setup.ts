import '@testing-library/jest-dom/vitest';
import * as elkWorkerModule from 'elkjs/lib/elk-worker.js';

const ElkWorker = (
  elkWorkerModule as unknown as { Worker: typeof Worker }
).Worker;

if (typeof globalThis.Worker === 'undefined') {
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: ElkWorker,
  });
  Object.defineProperty(window, 'Worker', {
    configurable: true,
    value: ElkWorker,
  });
}

if (!hasUsableLocalStorage()) {
  const storage = new Map<string, string>();
  const localStorageMock: Storage = {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key) {
      return storage.get(key) ?? null;
    },
    key(index) {
      return [...storage.keys()][index] ?? null;
    },
    removeItem(key) {
      storage.delete(key);
    },
    setItem(key, value) {
      storage.set(key, value);
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
  });
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

function hasUsableLocalStorage(): boolean {
  try {
    const key = 'capability-canvas.test-storage';
    window.localStorage.setItem(key, key);
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
