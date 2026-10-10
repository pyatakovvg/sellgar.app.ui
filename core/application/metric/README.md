# Метрики приложения

- Статус документа: current

Core предоставляет один `ApplicationMetricInterface` на приложение. Прикладной
код передаёт класс события и его данные, runtime валидирует их и вызывает
подключённые адаптеры. Адаптеры реализуют общий контракт и могут работать вместе.

## Объявление события

```ts
import { MetricEvent } from '@tiyn/app';
import { IsNumber, IsString } from 'class-validator';

@MetricEvent('payment.completed')
export class PaymentCompletedEvent {
  @IsString()
  readonly paymentId!: string;

  @IsNumber()
  readonly amount!: number;
}
```

Имя принадлежит metadata класса; payload состоит из объявленных полей.
`declare`, позиционный constructor и обязательный `@Expose()` не нужны.
Класс создаётся без аргументов и не должен выполнять побочных эффектов.
Как для `@Query`, требуется `useDefineForClassFields: true`: поля с `!` должны
существовать в runtime. Методы, поля-функции и неизвестные ключи не отправляются.
Это правило распространяется на вложенные классы и массивы классов с `@Type`.
Объявленные поля без валидаторов и значения по умолчанию сохраняются; обычные
`Record` сохраняют свои ключи. При сериализации payload извлекается из собственных
полей данных: getters, методы и `class-transformer` преобразования `toPlainOnly`
не вызываются. `@Expose`/`@Exclude` не задают состав payload.

Декораторы `class-validator` задают runtime-проверки. Отсутствующие обязательные
значения не пропускаются автоматически; optional-поля отмечаются `@IsOptional()`.
Nested class models используют `@Type` и `@ValidateNested`. Асинхронные validators
поддерживаются без изменения порядка событий. Implicit conversion выключен.
Преобразование входа сохраняет `@Type` и явные input `@Transform`. Оно использует
`class-transformer`, поэтому конструкторы, accessors и transforms моделей должны
быть без побочных эффектов; правило сериализации не изолирует исполнение этого кода.

## Отправка и маршрутизация

```ts
metric.track(PaymentCompletedEvent, { paymentId, amount });
metric.track(PaymentCompletedEvent, { paymentId, amount }, { to: [YandexMetric] });
metric.track(PaymentCompletedEvent, { paymentId, amount }, { to: [YandexMetric, MatomoMetric] });
```

Тип данных выводится из класса события. Без `to` отправка идёт всем подключённым
метрикам; `to: []` означает отсутствие получателей. Повторяющиеся tokens
дедуплицируются; неизвестный получатель репортится и не мешает остальным.
Без подключённых метрик вызов ничего не отправляет. `track` возвращает `void`.

Контроллер получает `ApplicationMetricInterface` через `@Inject`. View получает
тот же application-scoped сервис через `useMetric()` из `@tiyn/app/react`,
`@tiyn/app/fsm` или `@tiyn/app/native`:

```tsx
const metric = useMetric();

const handleHelpOpen = () => {
  metric.track(HelpOpenedEvent, { source: 'header' });
};
```

Отправлять UI-события нужно из обработчиков, бизнес-события — после подтверждения
результата use case. Render сам по себе не отправляет события. Просмотр страницы
можно объявить обычным классом события; отдельного `pageView` нет.

## Адаптеры и конфигурация

```ts
import { Metric, type MetricInterface, type MetricPayload } from '@tiyn/app';

@Metric()
export class ConsoleMetric implements MetricInterface {
  track(name: string, payload: MetricPayload): void {
    console.info(name, payload);
  }
}

// В configure приложения:
app.metrics([ConsoleMetric]);
```

Контракт адаптера:

```ts
interface MetricInterface {
  initialize?(context: MetricInitializeContext): void | Promise<void>;
  track(name: string, payload: MetricPayload): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
```

`MetricInitializeContext` содержит `signal: AbortSignal`. Адаптер получает имя
и подготовленный payload, не class token или экземпляр события. Он преобразует
их в формат своего SDK. Core не импортирует SDK и не делает сетевых запросов.
Каждый адаптер получает отдельную копию данных; последующие изменения caller
и другого адаптера не изменяют его payload. Функции, символы и циклические
значения отклоняются при подготовке, ошибки идут reporter.

`@Metric` включает DI. Зависимости адаптера регистрируются через `@UseBindings`.
Конкретный adapter package может предоставлять `configure(options): MetricToken`:

```ts
app.metrics([YandexMetric.configure({ counterId: 123456 }), MatomoMetric.configure({ siteId: '1', trackerUrl })]);
```

Это пример API внешних интеграций; `YandexMetric` и `MatomoMetric` не входят в пакет.
Если `configure` возвращает отдельный class, он объявляется
`@Metric({ token: YandexMetric })`, чтобы `to: [YandexMetric]` разрешался в
настроенный instance. Декорированный subclass наследует исходную identity
автоматически, вместе с DI аргументами конструктора и внедряемыми свойствами
декорированного родителя. Собственные `@Inject` подкласса переопределяют
зависимости в соответствующих позициях. Если подкласс объявляет собственный
конструктор с другим набором аргументов, использовать
`@Metric({ inheritConstructorArguments: false })`: это исключает ненужные
зависимости родительского конструктора, в том числе для конструктора без аргументов.
Наследование не зависит от наличия `design:paramtypes` в output транспилятора.
Не использовать mutable static options или глобальный instance.

Один исходный token имеет один instance в application scope. Повторная
регистрация репортится; действует первая. Реестры разных приложений изолированы.
Изменение registrations после compose не поддерживается.

## Очередь и lifecycle

Все metric bindings подключаются до создания адаптеров. Инициализация
получателей независима; приложение не ждёт готовности SDK и продолжает startup.
До готовности события остаются в отдельной FIFO-очереди получателя.

Лимит — **150 ожидающих записей на получателя** суммарно на стадии подготовки
и в очереди доставки. Текущая подготовка и текущий вызов адаптера учитываются
отдельно. Подготовка сохраняет порядок вызовов даже при асинхронной валидации;
в очередь доставки попадают только успешно проверенные события.

Если очередь доставки заполнена, следующее валидное событие вытесняет самую
старую ожидающую запись; невалидное событие никого не вытесняет. Если подготовка
уже занята и суммарный лимит ожидающих записей исчерпан, новое событие для этого
получателя отклоняется до постановки в подготовку. Это ограничивает накопление
при зависшем валидаторе. Обе потери репортятся. Остальные получатели принимают
событие независимо, если у них есть место; валидация общая и выполняется один раз.

После готовности доставка последовательна; лимит действует и при накоплении
за медленным адаптером. Готовые получатели не ждут остальные.

Ошибка валидации исключает событие из отправки всем адресатам. Ошибка создания
или initialize отключает только этот адаптер. Ошибка track репортится, запись
удаляется и обработка следующей продолжается. Отдельных retries, анализа HTTP,
network-status подписок и восстановления очереди после перезагрузки нет.
Promise адаптера подтверждает завершение его вызова, не доставку на сервер.

При application dispose новые события больше не принимаются. Незавершённый
initialize получает abort, его очередь очищается. Принятые события готовых
адаптеров обрабатываются в пределах общего бюджета **2 секунды**, затем
вызывается dispose каждого созданного instance, включая failed initialization.
Ожидание cleanup не продлевает бюджет. Late results не запускают новые отправки,
rejected promises остаются обработанными. Ошибки после окончательного shutdown
не обращаются к уже освобождённому reporter.

Metrics завершаются до освобождения reporters и DI scope. Abort не может
принудительно остановить сторонний SDK: адаптер сам освобождает subscriptions
и учитывает signal. Доставка при уничтожении вкладки/процесса не гарантируется.

## Диагностика и проверки

Ошибки идут в `ApplicationReporterInterface.error`, без application failure UI.
Фазы: `declaration`, `resolve`, `initialize`, `routing`, `prepare`, `overflow`,
`delivery`, `dispose`. Диагностическое событие имеет вид `metric.<phase>.failed`.
Передаются cause, token name, operation и доступное имя metric event;
весь payload по умолчанию не копируется. Reporting не порождает metric events.

- [Публичная типизация](../../../contracts/application-metric.fixture.ts).
- [Подготовка и валидация](runtime/metric-event-preparation/metric-event-preparation.test.ts).
- [Доставка, очереди и shutdown](runtime/application-metric/application-metric.test.ts).
- [Application/DI integration](../lifecycle/application/application-metric.test.ts).
- Hooks проверяются в owner-тестах каждого renderer, включая StrictMode.

История решения: [RFC](../../../docs/rfc/application-metrics.md).
