# AGENTS.md

## Назначение

`layout` владеет `@Layout` declaration и framework rendering support для route
и frame layouts.

## Границы

- `@Layout` задаёт view и providers для composition shell.
- Layout rendering должно оставаться generic framework поведение.
- Конкретные shell packages живут в `layouts/*`, не здесь.
- Business navigation, tabs, headers и UI labels не принадлежат core layout
  layer.

## Проверка

- Declaration/rendering изменения: проверить затронутый router/frame rendering.
- Сверить docs `../../docs/03-router-and-navigation.md` и `../../docs/14-layout-package-structure.md`.
