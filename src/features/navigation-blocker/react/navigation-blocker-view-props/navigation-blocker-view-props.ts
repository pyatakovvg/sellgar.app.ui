export interface NavigationBlockerViewProps {
  readonly inProcess: boolean;

  leave(): void;

  stay(): void;
}
