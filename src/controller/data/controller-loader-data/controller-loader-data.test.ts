import { describe, expect, it } from 'vitest';

import { createControllerLoaderData, getControllerActionKey, getControllerLoaderData } from './';

describe('controller loader data', () => {
  it('stores stable action keys and loader values by controller token', () => {
    const data = createControllerLoaderData([
      {
        actionKey: 'controller-action:1',
        controller: FirstController,
        value: {
          name: 'Ada',
        },
      },
      {
        actionKey: 'controller-action:2',
        controller: SecondController,
        value: {
          name: 'Grace',
        },
      },
    ]);

    expect(getControllerActionKey(data, FirstController)).toBe('controller-action:1');
    expect(getControllerActionKey(data, SecondController)).toBe('controller-action:2');
    expect(getControllerLoaderData(data, FirstController)).toEqual({
      name: 'Ada',
    });
  });

  it('throws when loader data is missing', () => {
    const data = createControllerLoaderData([]);

    expect(() => {
      getControllerLoaderData(data, FirstController);
    }).toThrow('Данные загрузчика контроллера недоступны.');
  });

  it('returns undefined when action key is missing', () => {
    const data = createControllerLoaderData([]);

    expect(getControllerActionKey(data, FirstController)).toBeUndefined();
  });
});

class FirstController {}

class SecondController {}
