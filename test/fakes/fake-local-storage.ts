/**
 * FakeLocalStorage - Test double for browser localStorage API
 *
 * Provides an in-memory implementation of the Storage interface
 * for testing components that persist to localStorage without
 * browser dependencies.
 *
 * @example
 * const storage = new FakeLocalStorage();
 * storage.setItem('theme', 'dark');
 * expect(storage.getItem('theme')).toBe('dark');
 */
export class FakeLocalStorage implements Storage {
  private storage = new Map<string, string>();

  get length(): number {
    return this.storage.size;
  }

  getItem(key: string): string | null {
    return this.storage.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.storage.set(key, value);
  }

  removeItem(key: string): void {
    this.storage.delete(key);
  }

  clear(): void {
    this.storage.clear();
  }

  key(index: number): string | null {
    const keys = Array.from(this.storage.keys());
    return keys[index] ?? null;
  }

  /**
   * Pre-populate storage with initial data for testing
   */
  setInitialData(data: Record<string, string>): void {
    for (const [key, value] of Object.entries(data)) {
      this.storage.set(key, value);
    }
  }
}
