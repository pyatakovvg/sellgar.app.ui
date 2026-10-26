import type { NextConfig } from 'next';

export interface NextAppOptions {
  /** Module with a named createApplication factory. Defaults to the adapter's empty application. */
  readonly application?: string;
  /** Automatically detects app/layout.* or src/app/layout.*. */
  readonly rootLayout?: string;
  /** Defaults to process.cwd(), as in the Next CLI. */
  readonly projectDir?: string;
}

export declare function withApp(config?: NextConfig, options?: NextAppOptions): NextConfig;
