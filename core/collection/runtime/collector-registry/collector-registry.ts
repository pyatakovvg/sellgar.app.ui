interface RegisteredCollector {
  reset(): void;
}

export class CollectorRegistry {
  private readonly collectors = new Map<string, RegisteredCollector>();
  private revoked = false;

  register(key: string, collector: RegisteredCollector): () => void {
    this.assertActive();

    if (this.collectors.has(key)) {
      throw new Error(`Collector "${key}" already belongs to a live controller in this runtime.`);
    }

    this.collectors.set(key, collector);

    return () => {
      if (this.collectors.get(key) === collector) this.collectors.delete(key);
    };
  }

  reset(key: string): void {
    this.assertActive();
    const collector = this.collectors.get(key);

    if (!collector) throw new Error(`Collector "${key}" is not registered in this runtime.`);

    collector.reset();
  }

  revoke(): void {
    this.revoked = true;
    this.collectors.clear();
  }

  private assertActive(): void {
    if (this.revoked) throw new Error('Collector runtime has been released.');
  }
}
