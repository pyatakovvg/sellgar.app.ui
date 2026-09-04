import { param, segments, type NavigationRequestFactory } from '@sellgar/app';
import * as ReactFacade from '@sellgar/app/react';
import { NavItem, NavLink, Route, Router } from '@sellgar/app/react';
import type { ApplicationConfiguratorInterface } from '@sellgar/app/react';

abstract class OneRoute {
  abstract readonly oneId: string;
}

abstract class TwiceRoute {
  abstract readonly twiceId: string;
}

abstract class StaticRoute {}

class IndexRoute {}

const router = new Router({
  routes: [
    new Route({
      load: async () => ({}),
      token: IndexRoute,
    }),
    new Route({
      address: segments('ones', param('oneId')),
      routes: [
        new Route({
          address: segments('twice', param('twiceId')),
          load: async () => ({}),
          token: TwiceRoute,
        }),
      ],
      token: OneRoute,
    }),
    new Route({
      address: segments('static'),
      load: async () => ({}),
      token: StaticRoute,
    }),
  ],
});

const staticNavigation: NavigationRequestFactory = (navigate) => navigate.to(StaticRoute);

const validNavigation = (
  <>
    <NavItem
      navigation={(navigate) =>
        navigate.through(OneRoute, { params: { oneId: 'one-1' } }).to(TwiceRoute, {
          params: { twiceId: 'twice-2' },
        })
      }
    >
      {({ execute }) => <button onClick={() => void execute()}>Open</button>}
    </NavItem>
    <NavLink
      viewTransition
      navigation={(navigate) =>
        navigate.through(OneRoute, { params: { oneId: 'one-1' } }).to(TwiceRoute, {
          params: { twiceId: 'twice-2' },
        })
      }
    >
      {({ anchor }) => (
        <a {...anchor} className={'navigation'} data-qa={'navigation.twice'}>
          Open as link
        </a>
      )}
    </NavLink>
    <NavLink navigation={(navigate) => navigate.to(StaticRoute)}>
      {({ anchor }) => <a {...anchor}>Open static route</a>}
    </NavLink>
  </>
);

const invalidContracts = (): void => {
  <NavLink
    // @ts-expect-error Native anchor attributes belong to the rendered anchor.
    anchor={{ className: 'navigation' }}
    navigation={(navigate) => navigate.to(StaticRoute)}
  >
    {({ anchor }) => <a {...anchor}>Open static route</a>}
  </NavLink>;

  <NavItem
    // @ts-expect-error OneRoute requires oneId.
    navigation={(navigate) => navigate.through(OneRoute).to(TwiceRoute, { params: { twiceId: 'twice-2' } })}
  >
    {() => null}
  </NavItem>;

  <NavItem
    // @ts-expect-error TwiceRoute requires twiceId.
    navigation={(navigate) => navigate.through(OneRoute, { params: { oneId: 'one-1' } }).to(TwiceRoute)}
  >
    {() => null}
  </NavItem>;

  <NavItem
    navigation={(navigate) =>
      navigate
        .through(OneRoute, {
          // @ts-expect-error Ancestor params are exact and cannot contain twiceId.
          params: { oneId: 'one-1', twiceId: 'twice-2' },
        })
        .to(TwiceRoute, { params: { twiceId: 'twice-2' } })
    }
  >
    {() => null}
  </NavItem>;

  <NavLink
    navigation={(navigate) =>
      navigate.through(OneRoute, { params: { oneId: 'one-1' } }).to(TwiceRoute, {
        // @ts-expect-error Target params are exact and cannot contain oneId.
        params: { oneId: 'one-1', twiceId: 'twice-2' },
      })
    }
  >
    {() => null}
  </NavLink>;

  <NavLink
    // @ts-expect-error StaticRoute does not accept params.
    navigation={(navigate) => navigate.to(StaticRoute, { params: {} })}
  >
    {() => null}
  </NavLink>;
};

const removedCompatibilityContracts = (app: ApplicationConfiguratorInterface): void => {
  // @ts-expect-error Frame compatibility alias is intentionally absent.
  void ReactFacade.Frame;
  // @ts-expect-error frames() compatibility method is intentionally absent.
  void app.frames;
};

void router;
void staticNavigation;
void validNavigation;
void invalidContracts;
void removedCompatibilityContracts;
