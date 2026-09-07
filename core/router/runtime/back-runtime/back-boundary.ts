declare const backBoundaryBrand: unique symbol;

export interface BackBoundary {
  readonly [backBoundaryBrand]: true;
}

export const createBackBoundary = (): BackBoundary => {
  return Object.freeze({}) as BackBoundary;
};
