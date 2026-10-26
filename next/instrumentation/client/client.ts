import { startBrowserApplication } from '../../application/runtime/browser-application';

// Next guarantees execution of this synchronous module before hydration.
// ApplicationHost consumes the Promise; Next does not await asynchronous instrumentation.
void startBrowserApplication().catch((error: unknown) => {
  console.error('[sellgar/app/next] Не удалось запустить браузерное приложение', error);
});
