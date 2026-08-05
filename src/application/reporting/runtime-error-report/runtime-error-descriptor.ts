import type {
  RuntimeErrorCode,
  RuntimeErrorPhase,
  RuntimeErrorSeverity,
  RuntimeErrorSource,
} from './runtime-error-report.ts';

interface RuntimeErrorDescriptor {
  readonly phase: RuntimeErrorPhase;
  readonly severity: RuntimeErrorSeverity;
  readonly source: RuntimeErrorSource;
}

const RUNTIME_ERROR_DESCRIPTORS: Record<RuntimeErrorCode, RuntimeErrorDescriptor> = {
  'application.disposable.dispose_failed': {
    phase: 'application.dispose',
    severity: 'error',
    source: 'application.disposable',
  },
  'application.event.handler_failed': {
    phase: 'application.event',
    severity: 'warning',
    source: 'application.event',
  },
  'application.initializer.failed': {
    phase: 'application.initialize',
    severity: 'critical',
    source: 'application.initializer',
  },
  'application.runtime_error_handler.failed': {
    phase: 'application.runtime_error',
    severity: 'error',
    source: 'application.runtime_error',
  },
  'frame.provider_before_render_failed': {
    phase: 'frame.provider.before_render',
    severity: 'error',
    source: 'frame.provider',
  },
  'frame.provider_dispose_failed': {
    phase: 'frame.provider.dispose',
    severity: 'warning',
    source: 'frame.provider',
  },
  'revalidate.handler.failed': {
    phase: 'revalidate',
    severity: 'warning',
    source: 'revalidate.handler',
  },
  'route.provider_before_load_failed': {
    phase: 'route.provider.before_load',
    severity: 'error',
    source: 'route.provider',
  },
  'route.provider_before_render_failed': {
    phase: 'route.provider.before_render',
    severity: 'error',
    source: 'route.provider',
  },
  'route.provider_dispose_failed': {
    phase: 'route.provider.dispose',
    severity: 'warning',
    source: 'route.provider',
  },
  'route.provider_setup_failed': {
    phase: 'route.provider.setup',
    severity: 'error',
    source: 'route.provider',
  },
  'route.module.commit_cleanup_failed': {
    phase: 'route.module.commit',
    severity: 'warning',
    source: 'route.module',
  },
  'route.module.discard_cleanup_failed': {
    phase: 'route.module.discard',
    severity: 'warning',
    source: 'route.module',
  },
  'route.module.dispose_failed': {
    phase: 'route.module.dispose',
    severity: 'error',
    source: 'route.module',
  },
  'route.module.provider_before_load_failed': {
    phase: 'route.module.provider.before_load',
    severity: 'error',
    source: 'route.module.provider',
  },
  'route.module.provider_before_render_failed': {
    phase: 'route.module.provider.before_render',
    severity: 'error',
    source: 'route.module.provider',
  },
  'route.module.provider_dispose_failed': {
    phase: 'route.module.provider.dispose',
    severity: 'warning',
    source: 'route.module.provider',
  },
  'route.module.provider_setup_failed': {
    phase: 'route.module.provider.setup',
    severity: 'error',
    source: 'route.module.provider',
  },
};

export const getRuntimeErrorDescriptor = (code: RuntimeErrorCode): RuntimeErrorDescriptor => {
  return RUNTIME_ERROR_DESCRIPTORS[code];
};
