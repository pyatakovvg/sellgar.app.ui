import { describe, expect, it } from 'vitest';
import { composeMetadata } from './metadata-composition';

describe('metadata composition', () => {
  it('formats application, page and frame roles, omitting absent parts', () => {
    const application = { title: 'Личный кабинет', description: 'Приложение' };
    const page = { title: 'Заказы', description: 'Список заказов' };
    const frame = { title: 'Настройка фильтров' };
    expect(composeMetadata({ application, page: {}, frames: [] }).title).toBe('Личный кабинет');
    expect(composeMetadata({ application, page, frames: [] }).title).toBe('Личный кабинет: Заказы');
    expect(composeMetadata({ application, page, frames: [frame] })).toEqual({
      title: 'Личный кабинет: Заказы (Настройка фильтров)',
      description: 'Список заказов',
    });
    expect(composeMetadata({ application, page, frames: [frame, { title: 'Сохранение', description: '' }] })).toEqual({
      title: 'Личный кабинет: Заказы (Настройка фильтров — Сохранение)',
      description: '',
    });
    expect(composeMetadata({ application: {}, page, frames: [{}] }).title).toBe('Заказы');
    expect(composeMetadata({ application: {}, page: {}, frames: [] }).title).toBeUndefined();
  });

  it('passes structured parts to an application formatter without changing local values', () => {
    const parts = { application: { title: 'Кабинет' }, page: { title: 'Заказы' }, frames: [{ title: 'Фильтры' }] };
    expect(
      composeMetadata(parts, {
        formatTitle: ({ application, page, frames }) => [frames[0]?.title, page.title, application.title].join(' | '),
      }).title,
    ).toBe('Фильтры | Заказы | Кабинет');
    expect(parts.page.title).toBe('Заказы');
  });
});
