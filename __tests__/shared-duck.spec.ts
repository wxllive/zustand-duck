import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { duck, MASTER_PORT_ID, sharedDuck, SharedDuckPort } from '../src';
import { createStore } from 'zustand/vanilla';
import { createPort, portsMap } from './mock/ports';

interface ThemeState {
  theme: 'dark' | 'light';
}

describe('share duck', () => {
  const state: ThemeState = { theme: 'light' };
  // mock multi process store
  const createThemeStore = (port: SharedDuckPort) => {
    return createStore(
      sharedDuck({
        state,
        name: 'theme',
        port,
        reducers: {
          setTheme (state, theme: ThemeState['theme']) {
            return { ...state, theme };
          },
        },
      })
    );
  };
  let themeStoreMaster: ReturnType<typeof createThemeStore>;
  let themeStoreReplica: ReturnType<typeof createThemeStore>;

  beforeEach(() => {
    themeStoreMaster = createThemeStore(createPort(MASTER_PORT_ID));
    portsMap.delete('replica');
  });

  test('share ready', async () => {
    await themeStoreMaster.actions.setTheme('dark');
    themeStoreReplica = createThemeStore(createPort('replica'));
    expect(themeStoreReplica.getState().theme).toBe('light');
    await themeStoreReplica.ready();
    expect(themeStoreReplica.getState().theme).toBe('dark');
  });

  test('replica action', async () => {
    themeStoreReplica = createThemeStore(createPort('replica'));
    await themeStoreReplica.ready();
    expect(themeStoreReplica.getState().theme).toBe('light');
    await themeStoreReplica.actions.setTheme('dark');
    expect(themeStoreMaster.getState().theme).toBe('dark');
  });
});
