import type { FrameRoute, FrameRouteDefinition } from '../../declaration/frame-route';
import { getFrameRouteDefinition, normalizeFrameRoutePath } from '../../declaration/frame-route';
import type { FrameRouter } from '../../declaration/frame-router';
import { getFrameRouterDefinition } from '../../declaration/frame-router';

export interface FrameRouteMatch {
  readonly branch: readonly FrameRoute[];
  readonly definition: FrameRouteDefinition;
  readonly params: Readonly<Record<string, string>>;
  readonly path: string;
  readonly route: FrameRoute;
}

export interface FrameRouterMatch {
  readonly basePath: string;
  readonly branch: readonly FrameRoute[];
  readonly defaultSource: string | null;
  readonly params: Readonly<Record<string, string>>;
  readonly route: FrameRouteMatch | null;
  readonly router: FrameRouter;
  readonly sourcePath: string;
}

export const matchFrameRouter = (router: FrameRouter, hash: string): FrameRouterMatch | null => {
  const definition = getFrameRouterDefinition(router);
  const source = normalizeHashPath(hash);
  const baseMatch = matchPattern(definition.baseSource, source, false);

  if (!baseMatch) {
    return null;
  }

  const remainingPath = source.slice(baseMatch.consumedLength).replace(/^\/+/, '');
  const routeMatch = matchFrameRoutes(definition.routes, remainingPath, baseMatch.params, [], '');
  const routeContext = routeMatch
    ? null
    : matchFrameRouteContext(
        definition.routes,
        remainingPath,
        baseMatch.params,
        [],
        source.slice(0, baseMatch.consumedLength),
      );

  return {
    basePath: source.slice(0, baseMatch.consumedLength).replace(/\/+$/, ''),
    branch: routeMatch?.branch ?? routeContext?.branch ?? [],
    defaultSource: routeContext?.defaultSource ?? null,
    params: routeMatch?.params ?? routeContext?.params ?? baseMatch.params,
    route: routeMatch,
    router,
    sourcePath: source,
  };
};

interface FrameRouteContextMatch {
  readonly branch: readonly FrameRoute[];
  readonly defaultSource: string | null;
  readonly params: Readonly<Record<string, string>>;
}

const matchFrameRouteContext = (
  routes: readonly FrameRoute[],
  source: string,
  inheritedParams: Readonly<Record<string, string>>,
  inheritedBranch: readonly FrameRoute[],
  inheritedSource: string,
): FrameRouteContextMatch | null => {
  for (const route of routes) {
    const definition = getFrameRouteDefinition(route);

    if (definition.load) {
      continue;
    }

    const path = definition.path === undefined ? '' : normalizeFrameRoutePath(definition.path);
    const pathMatch = matchPattern(path, source, false);

    if (!pathMatch) {
      continue;
    }

    const consumedSource = source.slice(0, pathMatch.consumedLength).replace(/\/+$/, '');
    const matchedSource = joinFrameRoutePath(inheritedSource, consumedSource);
    const remainingPath = source.slice(pathMatch.consumedLength).replace(/^\/+/, '');
    const branch = [...inheritedBranch, route];
    const params = { ...inheritedParams, ...pathMatch.params };

    if (remainingPath.length === 0 && definition.defaultTo !== undefined) {
      return {
        branch,
        defaultSource: joinFrameRoutePath(matchedSource, normalizeFrameRoutePath(definition.defaultTo)),
        params,
      };
    }

    const childContext = matchFrameRouteContext(definition.routes, remainingPath, params, branch, matchedSource);

    if (childContext) {
      return childContext;
    }

    return { branch, defaultSource: null, params };
  }

  return null;
};

const matchFrameRoutes = (
  routes: readonly FrameRoute[],
  source: string,
  inheritedParams: Readonly<Record<string, string>>,
  inheritedBranch: readonly FrameRoute[],
  inheritedPath: string,
): FrameRouteMatch | null => {
  for (const route of routes) {
    const definition = getFrameRouteDefinition(route);
    const path = definition.path === undefined ? '' : normalizeFrameRoutePath(definition.path);
    const pathMatch = matchPattern(path, source, definition.load !== undefined);

    if (!pathMatch) {
      continue;
    }

    const branch = [...inheritedBranch, route];
    const params = { ...inheritedParams, ...pathMatch.params };
    const matchedPath = joinFrameRoutePath(inheritedPath, path);

    if (definition.load) {
      return {
        branch,
        definition,
        params,
        path: matchedPath,
        route,
      };
    }

    const remainingPath = source.slice(pathMatch.consumedLength).replace(/^\/+/, '');
    const childMatch = matchFrameRoutes(definition.routes, remainingPath, params, branch, matchedPath);

    if (childMatch) {
      return childMatch;
    }
  }

  return null;
};

interface PatternMatch {
  readonly consumedLength: number;
  readonly params: Readonly<Record<string, string>>;
}

const matchPattern = (pattern: string, source: string, end: boolean): PatternMatch | null => {
  const patternSegments = splitPath(pattern);
  const sourceSegments = splitPath(source);

  if (patternSegments.length > sourceSegments.length || (end && patternSegments.length !== sourceSegments.length)) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const sourceSegment = sourceSegments[index];

    if (patternSegment.startsWith(':')) {
      const decodedSegment = decodeFrameRouteSegment(sourceSegment);

      if (decodedSegment === null) {
        return null;
      }

      params[patternSegment.slice(1)] = decodedSegment;
      continue;
    }

    if (patternSegment !== sourceSegment) {
      return null;
    }
  }

  return {
    consumedLength: sourceSegments.slice(0, patternSegments.length).join('/').length,
    params,
  };
};

const decodeFrameRouteSegment = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
};

const normalizeHashPath = (hash: string): string => {
  return hash.replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
};

const splitPath = (path: string): string[] => {
  const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '');

  return normalized.length === 0 ? [] : normalized.split('/');
};

const joinFrameRoutePath = (parent: string, child: string): string => {
  return [parent, child].filter((value) => value.length > 0).join('/');
};
