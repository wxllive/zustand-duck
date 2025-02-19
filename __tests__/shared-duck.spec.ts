import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { duck, MASTER_PORT_ID, sharedDuck, SharedDuckPort } from '../src';
import { create } from 'zustand';
import { Subscribe } from './Subscribe';

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
    return create(
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
  let useThemeMaster: ReturnType<typeof createThemeStore>;
  let useThemeReplica: ReturnType<typeof createThemeStore>;

  beforeEach(() => {
    useThemeMaster = createThemeStore(createPort(MASTER_PORT_ID));
    portsMap.delete('replica');
  });

  test('share ready', async () => {
    await useThemeMaster.actions.setTheme('dark');
    useThemeReplica = createThemeStore(createPort('replica'));
    expect(useThemeReplica.getState().theme).toBe('light');
    await useThemeReplica.ready();
    expect(useThemeReplica.getState().theme).toBe('dark');
  });

  test('replica action', async () => {
    useThemeReplica = createThemeStore(createPort('replica'));
    await useThemeReplica.ready();
    expect(useThemeReplica.getState().theme).toBe('light');
    await useThemeReplica.actions.setTheme('dark');
    expect(useThemeMaster.getState().theme).toBe('dark');
  });
});
