declare const navigationBlockerBoundaryBrand: unique symbol;

export interface NavigationBlockerBoundary {
  readonly [navigationBlockerBoundaryBrand]: true;
}

export const createNavigationBlockerBoundary = (): NavigationBlockerBoundary => {
  return Object.freeze({}) as NavigationBlockerBoundary;
};
