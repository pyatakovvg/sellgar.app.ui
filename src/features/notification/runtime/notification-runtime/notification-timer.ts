interface NotificationTimerOptions {
  readonly durationMs: number;
  readonly onFinish: () => void;
}

export class NotificationTimer {
  private remainingMs: number;
  private startedAtMs = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: NotificationTimerOptions) {
    this.remainingMs = options.durationMs;
  }

  cancel(): void {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  pause(): void {
    if (this.timeoutId === null) {
      return;
    }

    clearTimeout(this.timeoutId);
    this.timeoutId = null;
    this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAtMs));
  }

  resume(): void {
    if (this.timeoutId !== null || this.remainingMs <= 0) {
      return;
    }

    this.start();
  }

  start(): void {
    this.cancel();
    this.startedAtMs = Date.now();
    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.remainingMs = 0;
      this.options.onFinish();
    }, this.remainingMs);
  }
}
