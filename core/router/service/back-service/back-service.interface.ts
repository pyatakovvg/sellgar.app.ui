export type BackCondition = () => boolean;

export type BackHandler = () => void | Promise<void>;

export interface BackInterception {
  dispose(): void;
}

export abstract class BackServiceInterface {
  abstract intercept(condition: BackCondition, handler: BackHandler): BackInterception;
}
