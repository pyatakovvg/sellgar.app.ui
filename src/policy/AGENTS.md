# AGENTS.md

## Назначение

`policy` владеет policy contract, policy descriptors, boundary decisions,
result handlers и policy runner.

## Границы

- Policies защищают route boundaries: `canMatch`, `canActivate`, `canAction`.
- Policy returns `PolicyResult`; handlers convert result to boundary decision.
- Business-specific policies живут в host/access packages, не здесь.
- Guards не подменяют route policies.

## Проверка

- Policy runner/descriptor изменения: локальные tests в `policy/runtime`.
- Сверить `Router.*` boundary decisions, если меняется handler поведение.
