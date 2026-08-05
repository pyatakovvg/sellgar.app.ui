export interface RouteMatchOptions {
  readonly end?: boolean;
}

export const matchPathname = (pathname: string, pattern: string, options: RouteMatchOptions = {}): boolean => {
  const currentPathname = normalizePathname(pathname);
  const targetPathname = normalizePathname(pattern);

  if (options.end ?? false) {
    return currentPathname === targetPathname;
  }

  if (targetPathname === '/') {
    return true;
  }

  return currentPathname === targetPathname || currentPathname.startsWith(`${targetPathname}/`);
};

const normalizePathname = (pathname: string): string => {
  const normalizedPathname = `/${pathname}`.replace(/\/+/g, '/').replace(/\/$/, '');

  return normalizedPathname === '' ? '/' : normalizedPathname;
};
