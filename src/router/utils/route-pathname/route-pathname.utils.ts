export const createRoutePathname = (parentPathname: string | undefined, path: string | undefined): string => {
  const parent = parentPathname ?? '/';

  if (path === undefined) {
    return normalizePathname(parent);
  }

  return normalizePathname(`${parent}/${path}`);
};

const normalizePathname = (pathname: string): string => {
  const normalizedPathname = `/${pathname}`.replace(/\/+/g, '/').replace(/\/$/, '');

  return normalizedPathname === '' ? '/' : normalizedPathname;
};
