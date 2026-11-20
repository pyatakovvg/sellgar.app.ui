/** Browser navigation activity. Server rendering always starts without pending work. */
export class NavigationActivity {
  private readonly listeners = new Set<() => void>();
  private pageUrl: string | null = null;
  private destination: string | null = null;

  getSnapshot = (): boolean => this.destination !== null;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  beginNavigation(url: string): void {
    const previous = this.getSnapshot();
    this.destination = this.pageUrl === url ? null : url;
    this.notify(previous);
  }

  commitPage(url: string): void {
    const previous = this.getSnapshot();
    this.pageUrl = url;
    this.destination = null;
    this.notify(previous);
  }

  private notify(previous: boolean): void {
    if (previous === this.getSnapshot()) return;
    for (const listener of this.listeners) listener();
  }
}
