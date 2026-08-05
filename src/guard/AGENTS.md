# AGENTS.md

## Назначение

`guard` владеет local capability checks: `GuardInterface`, `@Guard`,
`UseGuards`, guard descriptors, runner, guarded method executor, `useGuard` и
`Guarded`.

## Границы

- Guards работают внутри уже активного runtime scope.
- `UseGuards` - metadata decorator для concrete controller loader/action
  boundaries.
- По умолчанию отказ guard бросает `GuardRejectedException`, если не задана
  другая failure strategy.
- Route boundary access должен оставаться в policies.

## Проверка

- Runner/executor/react изменения: локальные tests в `guard/runtime` и
  `guard/react`.
- Проверить docs `../../docs/11-guards.md`, если меняется contract.
