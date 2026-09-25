# Application CommandsService

Статус: current.

`CommandsServiceInterface.get(CommandsToken)` возвращает типизированный набор
команд текущего committed snapshot. Класс объявляет свойства с `@Command`.
До первого снапшота возвращается `null`; state и токен screen не требуются.
Клиент получает `commands.change(...)` и `commands.change.available`, а не
передаёт классы отдельных команд при каждом вызове.

Сервис application-scoped. При наличии `FsmTransportInterface` приложение
разрешает его в application scope во время compose, до создания route scopes.
При dispose приложения общий execution runtime отменяет незавершённые запросы
и ожидания подтверждения и запрещает новые вызовы.
Отсутствие transport допускается для приложений, не использующих команды;
обращение к сервису в таком приложении требует зарегистрировать transport.

ScreenService сохраняет маршрутную границу и предварительную загрузку state.
Оба сервиса используют `CommandRuntime` для доступности, проверки snapshot
перед отправкой и class-transformer/class-validator. Их route/application
контексты разделяют один application-scoped `CommandExecution`.
Контекст старого snapshot не может отправлять команды после нового commit.
Доступность определяется transport и данными сервера, не наличием декларации.
Framework не знает `shell`, названий команд и полей прикладного снапшота.

## Завершение команды

- Promise команды успешно завершается после готовности маршрута, выбранного
  новым snapshot: загрузки модуля, подготовки providers/loaders и завершения
  перехода. При том же маршруте ожидается завершение revalidation его данных.
  Получение snapshot, HTTP success и публикация navigation commit сами по себе
  команду не завершают.
- Execution runtime генерирует opaque command id и регистрирует ожидание
  до отправки. Transport получает этот id только для исходящего `send`.
  Идентификатор не используется для сопоставления входящих snapshot.
- FSM Application передаёт execution runtime committed navigation state только
  после завершения navigation (`pending === null`). Готовое представление
  завершает ожидание независимо от screen и наличия intentId, включая
  представления notFound и ошибки подготовки маршрута.
  Повторная публикация текущего объекта snapshot её не завершает.
  Framework не классифицирует snapshots как фоновые или связанные с командой.
  Snapshot может прийти раньше HTTP-ответа.
- В одном приложении выполняется одна команда. Повтор той же команды того же
  snapshot получает существующий Promise, другая команда отклоняется до отправки.
  Этот запрет не меняет server-owned `command.available` и не блокирует UI-кнопки.
- Освобождение прежнего route закрывает его command context, но не отменяет
  application-owned ожидание: новый route должен успеть применить snapshot.
- FSM renderer сохраняет committed ветку во время подготовки следующего
  маршрута. Pending-ветка не заменяет текущий экран на fallback. Первый запуск
  остаётся под application splash до готовности маршрута.
- Transport/validation error завершает операцию ошибкой. Без подтверждения
  через 30 секунд ожидание также завершается ошибкой, запрос отменяется.
  Accepted no-op без snapshot не считается успехом. Автоматического повтора нет.
- Подтверждённый snapshot является результатом даже при поздней HTTP-ошибке.
  Поздний callback старой операции не изменяет новую операцию.
- Dispose приложения снимает подписку на navigation, очищает таймер и отменяет
  ожидание и запрос. Разные Application instances не разделяют execution state.

Клиент терминала передаёт opaque id в обязательном `UiCommandRequest.intentId`,
но не требует этого поля во входящем snapshot. Wire contract и backend не меняются.
