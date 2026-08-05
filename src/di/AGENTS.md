# AGENTS.md

## Назначение

`di` владеет dependency tokens, binding registry/builder contracts,
`BindingModuleInterface`, `UseBindings`, injection decorators и Inversify
adapter.

## Границы

- Внешний код использует DI facade из `@sellgar/app`, а не Inversify напрямую.
- Binding modules описывают framework/application bindings, не business wiring.
- `UseBindings` связывает declarations с binding modules.
- Не расширять DI facade ради локального workaround без runtime-сценария.

## Проверка

- Изменение binding/decorator/token contracts: проверить затронутый runtime scopes
  и публичный exports.
- Проверить циклы imports, если меняются barrels или facade exports.
