import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { duck, MASTER_PORT_ID, sharedDuck, SharedDuckChannels, SharedDuckPort, shareWithChannels } from '../src';
import { Subscribe } from './mock/Subscribe';
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
      return portsMap.get(id)?.on('message', handler) ?? (() => void 0);
    }
  };

  portsMap.set(id, subscribe);

  return port;
};

describe('share duck with channels', () => {
  const state: ThemeState = { theme: 'light' };
  // mock multi process store
  const createThemeStore = (port: SharedDuckPort, channel?: string) => {
    const channels = new SharedDuckChannels();
    channels.default = channel ?? '';

    return shareWithChannels(channels, (channel) => {
      return createStore(
        sharedDuck({
          state,
          name: 'theme',
          port,
          channel,
          channels,
          reducers: {
            setTheme (state, theme: ThemeState['theme']) {
              return { ...state, theme };
            },
          },
        })
      );
    });
  };
  let themeStoreMaster: ReturnType<typeof createThemeStore>;
  let themeStoreReplica: ReturnType<typeof createThemeStore>;

  beforeEach(() => {
    themeStoreMaster = createThemeStore(createPort(MASTER_PORT_ID));
    portsMap.delete('replica');
  });

  test('custom channel', async () => {
    themeStoreReplica = createThemeStore(createPort('replica'), 'channel-x');
    await themeStoreReplica.ready();
    expect(themeStoreReplica.getState().theme).toBe('light');
    await themeStoreReplica.actions.setTheme('dark');
    expect(themeStoreMaster.channel('channel-x').getState().theme).toBe('dark');
  });
});
