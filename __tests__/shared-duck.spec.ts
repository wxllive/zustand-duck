import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { duck, MASTER_PORT_ID, sharedDuck, SharedDuckPort } from '../src';
import { Subscribe } from './Subscribe';
import { createStore } from 'zustand/vanilla';

interface ThemeState {
  theme: 'dark' | 'light';
}

const portsMap = new Map<string, Subscribe<any>>();
const createPort = (id: string) => {
  const subscribe = new Subscribe();
  const port: SharedDuckPort = {
    id,
    send: (id, message) => {
      setTimeout(() => {
        portsMap.get(id)?.trigger('message', message);
      }, 0);
    },
    onMessage: (handler) => {
      portsMap.get(id)?.on('message', handler);
    }
  };

  portsMap.set(id, subscribe);

  return port;
};

describe('share duck', () => {
  const state: ThemeState = { theme: 'light' };
  // 由于测试用例代码都在一个进程中，无法直接使用同一个store，所以下面用同一份代码逻辑创建多个来模拟多进程的场景
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
