# AGENTS.md

## Назначение

`frame` владеет `@Frame`, `FrameRouter`/`FrameRoute`,
сопоставлением hash, browser history, shell contract и frame runtime. Сам
navigation port принадлежит `router`.

## Границы

- Каждый Frame загружается только через `FrameRoute` внутри `FrameRouter`.
- `Route.frames` принимает только `FrameRouter`; standalone frames и открытие по
  frame token не поддерживаются.
- `@Frame` содержит собственные `view`, `layouts`, `providers`, `fallback` и
  `exception`. Source, shell, route params и policies ему не принадлежат;
  declaration не имеет generic и не наследует definition class.
- Controller читает route params через `args.params`, view — через общий
  `useParams<TParams>()`; Frame не получает route params как React props.
- Доступность `FrameRouter` определяется активной веткой обычного `Router`.
  Runtime router-а принадлежит тому `Route`, где он объявлен; router родителя
  доступен потомкам без копирования в дочерние scopes. FrameRouter runtime
  создаётся от стабильного Route scope и не должен зависеть от Module scope.
- При прямом входе/F5 route/module и активный frame route preload-ятся
  параллельно до первого render под общим application splash. FrameLayer не
  должен откладывать frame load до render Module и повторно загружать уже
  подготовленный runtime. Frame preload начинается только после успешных
  `canMatch`/`canActivate` целевой обычной Route-ветки.
- Все переходы выполняются через общий `NavigateServiceInterface` или
  `useNavigate`: `navigate.frame.open('/source')`. Frame source всегда
  абсолютный; относительная навигация запрещена. Закрытие выполняется через
  `navigate.frame.close()`.
- URL hash и общая browser history являются источниками активного frame route и
  возврата. Frame runtime не хранит отдельную историю и не вычисляет
  структурного родителя.
- Shell разрешается как `FrameRouter.shell ?? app.frames.shell`. `@Frame`
  собственного shell не имеет.
- `app.frames({ shell })` обязателен при наличии `FrameRouter`; остальные frame
  boundaries наследуются из `app.components`.
- Ошибка concrete Frame loader/action/render остаётся в Frame runtime. Ошибка
  router shell, router layouts, policies или router providers принадлежит
  FrameRouter boundary.
- Frame revalidate локален к активному frame instance.
- Drawer/modal presentation принадлежит frame shell или package-потребителю, не
  core runtime.

## Проверка

- Declaration/matching/navigation/runtime: локальные tests в `frame/*`.
- History/hash: проверить прямой URL, вложенный flow, переход между независимыми
  routers, `close()` и browser back.
- Initial preload: проверить одновременный старт Module и Frame, общий splash и
  reuse подготовленного runtime после mount FrameLayer.
- Route availability: проверить parent/child route ownership в router adapter.
- Публичный contract: сверить `src/index.ts` и `docs/06-frames.md`.
