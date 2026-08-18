# AGENTS.md

## Назначение

`router` владеет declarations `Router`/`Route`, route runtime, route policies,
frame availability, params conversion, location/navigate services и search/hash
utils.

## Границы

- Route tree описывается object declarations, не React Router objects напрямую.
- `RouterService` является adapter-owned source для navigator/location sync.
- `LocationServiceInterface` - чтение location, params, hash/search и DTO
  conversion.
- `useParams<TParams>()` читает params ближайшего controller runtime: route
  params в Module и объединённые route/frame-route params во Frame.
- `NavigateServiceInterface` - единый port для route/frame navigation,
  replace/back и hash/search updates. Frame-операции сгруппированы в
  `navigate.frame` и не раскрывают URL hash feature-коду.
- Policy decisions описываются через `Router.continue/redirectTo/...`.
- Adapter обязан до первого render сопоставить frame hash с будущей активной
  Route-веткой и запустить Frame preload параллельно route/module loaders.
  Продолжать обе цепочки можно только после успешных `canMatch`/`canActivate`
  целевой Route-ветки. Готовность initial navigation включает обе цепочки;
  FrameRouter принадлежит Route scope, а не Module scope.
- Auth/profile semantics и фича route tree здесь не размещать.

## Проверка

- Route/Router declaration: тесты `router/declaration`.
- Runtime/service/utils: локальные тесты в `router/runtime`, `router/service`,
  `router/utils`.
- Initial navigation: проверить прямой URL/F5 с frame hash, параллельный preload
  и отсутствие повторного frame load после mount.
- Изменение публичного contract: сверить `src/index.ts` и docs/router.
