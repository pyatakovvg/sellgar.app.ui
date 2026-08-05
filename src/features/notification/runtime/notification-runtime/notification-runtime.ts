import type { NotificationHandle, NotificationPayload } from '../../contract/notification-service';

import type { NotificationRequest } from './notification-request.ts';
import { NotificationRuntimeInterface, type NotificationRuntimeListener } from './notification-runtime.interface.ts';
import { NotificationTimer } from './notification-timer.ts';

const DEFAULT_NOTIFICATION_TIMEOUT_MS = 5000;
const DEFAULT_NOTIFICATION_PLACEMENT = 'bottom-right';
const DEFAULT_NOTIFICATION_STATUS = 'info';

export class NotificationRuntime extends NotificationRuntimeInterface {
  private readonly listeners = new Set<NotificationRuntimeListener>();
  private readonly timers = new Map<string, NotificationTimer>();
  private notifications: NotificationRequest[] = [];
  private sequence = 0;

  close(notificationId: string): void {
    this.cancelAutoClose(notificationId);
    this.notifications = this.notifications.filter((notification) => notification.id !== notificationId);
    this.emit();
  }

  getSnapshot(): readonly NotificationRequest[] {
    return this.notifications;
  }

  pauseAutoClose(notificationId: string): void {
    this.timers.get(notificationId)?.pause();
  }

  resumeAutoClose(notificationId: string): void {
    this.timers.get(notificationId)?.resume();
  }

  show(notification: NotificationPayload): NotificationHandle {
    const id = this.createId();
    const request: NotificationRequest = {
      ...notification,
      id,
      placement: notification.placement ?? DEFAULT_NOTIFICATION_PLACEMENT,
      status: notification.status ?? DEFAULT_NOTIFICATION_STATUS,
    };

    this.notifications = [...this.notifications, request];
    this.scheduleAutoClose(request);
    this.emit();

    return {
      close: () => this.close(id),
      id,
    };
  }

  subscribe(listener: NotificationRuntimeListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
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

  private scheduleAutoClose(notification: NotificationRequest): void {
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
