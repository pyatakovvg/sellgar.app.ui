import { DisposableRegistryInterface } from '../../../../application/disposable/disposable-registry';
import { Inject, Injectable } from '../../../../di/injection/decorators';
import type { NotificationHandle, NotificationPayload } from '../../contract/notification-service';

import type { NotificationRequest } from './notification-request.ts';
import { NotificationRuntimeInterface, type NotificationRuntimeListener } from './notification-runtime.interface.ts';
import { NotificationTimer } from './notification-timer.ts';

const DEFAULT_NOTIFICATION_TIMEOUT_MS = 5000;
const DEFAULT_NOTIFICATION_STATUS = 'info';
const EMPTY_NOTIFICATION_SNAPSHOT: readonly NotificationRequest<unknown>[] = Object.freeze([]);

@Injectable()
export class NotificationRuntime extends NotificationRuntimeInterface {
  private readonly listeners = new Set<NotificationRuntimeListener>();
  private readonly timers = new Map<string, NotificationTimer>();

  private disposed = false;
  private notifications: readonly NotificationRequest<unknown>[] = EMPTY_NOTIFICATION_SNAPSHOT;
  private sequence = 0;

  constructor(@Inject(DisposableRegistryInterface) disposables: DisposableRegistryInterface) {
    super();
    disposables.add(this);
  }

  close(notificationId: string): void {
    this.cancelAutoClose(notificationId);
    this.notifications = Object.freeze(this.notifications.filter((notification) => notification.id !== notificationId));
    this.emit();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    for (const timer of this.timers.values()) {
      timer.cancel();
    }

    this.timers.clear();
    this.notifications = EMPTY_NOTIFICATION_SNAPSHOT;
    this.listeners.clear();
  }

  getSnapshot<TContent = unknown>(): readonly NotificationRequest<TContent>[] {
    // TContent is owned by the renderer facade and erased while the application-scoped queue stores it.
    return this.notifications as readonly NotificationRequest<TContent>[];
  }

  pauseAutoClose(notificationId: string): void {
    this.timers.get(notificationId)?.pause();
  }

  resumeAutoClose(notificationId: string): void {
    this.timers.get(notificationId)?.resume();
  }

  show<TContent>(notification: NotificationPayload<TContent>): NotificationHandle {
    this.assertActive();

    const id = this.createId();
    const request: NotificationRequest<TContent> = Object.freeze({
      ...notification,
      id,
      status: notification.status ?? DEFAULT_NOTIFICATION_STATUS,
    });

    this.notifications = Object.freeze([...this.notifications, request]);
    this.scheduleAutoClose(request);
    this.emit();

    return Object.freeze({
      close: () => this.close(id),
      id,
    });
  }

  subscribe(listener: NotificationRuntimeListener): () => void {
    this.assertActive();
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('NotificationRuntime уже освобожден.');
    }
  }

  private cancelAutoClose(notificationId: string): void {
    const timer = this.timers.get(notificationId);

    if (!timer) {
      return;
    }

    timer.cancel();
    this.timers.delete(notificationId);
  }

  private createId(): string {
    this.sequence++;

    return `notification-${Date.now()}-${this.sequence}`;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private scheduleAutoClose(notification: NotificationRequest<unknown>): void {
    if (!notification.autoClose) {
      return;
    }

    const timer = new NotificationTimer({
      durationMs: notification.timeoutMs ?? DEFAULT_NOTIFICATION_TIMEOUT_MS,
      onFinish: () => this.close(notification.id),
    });

    this.timers.set(notification.id, timer);
    timer.start();
  }
}
