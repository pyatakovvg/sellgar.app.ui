/** Admission belongs to the gesture that started, not its eventual scroll position. */
export class RefreshGesture {
  private allowed = false;
  private refreshing = false;

  begin(atTop: boolean, keyboardVisible: boolean): void {
    this.allowed = atTop && !keyboardVisible;
  }

  accept(keyboardVisible: boolean): boolean {
    if (!this.allowed || this.refreshing || keyboardVisible) return false;

    this.allowed = false;
    this.refreshing = true;
    return true;
  }

  complete(): void {
    this.refreshing = false;
  }
}

export const isRefreshStart = (offset: number, insetTop: number): boolean => offset + insetTop <= 0.5;
