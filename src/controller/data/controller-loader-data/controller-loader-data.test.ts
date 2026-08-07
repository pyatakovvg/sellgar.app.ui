import { describe, expect, it } from 'vitest';

import { createControllerLoaderData, getControllerLoaderData } from './';

describe('controller loader data', () => {
  it('stores loader values by controller token', () => {
    const data = createControllerLoaderData([
      {
        controller: FirstController,
        value: {
          name: 'Ada',
        },
      },
      {
        controller: SecondController,
        value: {
          name: 'Grace',
        },
      },
    ]);

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
});

class FirstController {}

class SecondController {}
