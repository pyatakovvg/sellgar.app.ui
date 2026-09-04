import type { NavigationBlockerRegistrationIdentity } from '../../../../../core/features/navigation-blocker/contract/navigation-blocker-service';
import type { NavigationBlockerPresentation } from '../../declaration/navigation-blocker-presentation';

export class NavigationBlockerPresentationRegistry {
  private readonly presentations = new Map<NavigationBlockerRegistrationIdentity, NavigationBlockerPresentation>();

  register(identity: NavigationBlockerRegistrationIdentity, presentation: NavigationBlockerPresentation): () => void {
    this.presentations.set(identity, presentation);

    return () => {
      if (this.presentations.get(identity) === presentation) {
        this.presentations.delete(identity);
      }
    };
  }

  resolve(identities: readonly NavigationBlockerRegistrationIdentity[]): NavigationBlockerPresentation | undefined {
    for (const identity of identities) {
      const presentation = this.presentations.get(identity);

      if (presentation) {
        return presentation;
      }
    }

    return undefined;
  }
}
