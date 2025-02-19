import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { duck } from '../src';
import { createStore } from 'zustand/vanilla';

interface ThemeState {
  theme: 'dark' | 'light';
}

describe('duck', () => {
  const state: ThemeState = { theme: 'light' };
  const themeStore = createStore(
    duck({
      state,
      reducers: {
        setTheme (state, theme: ThemeState['theme']) {
          return { ...state, theme };
        },
      },
    })
  );

  beforeEach(() => {
    themeStore.actions.reset();
  });

  test('dispatch action', async () => {
    expect(themeStore.actions.setTheme).toBeDefined();
    expect(themeStore.getState().theme).toBe('light');

    themeStore.actions.setTheme('dark');

    expect(themeStore.getState().theme).toBe('dark');
  });

  test('wait', async () => {
    const spy = jest.fn();
    const promise = themeStore.wait(state => state.theme === 'dark').then(spy);

    expect(spy).not.toHaveBeenCalled();
    themeStore.actions.setTheme('dark');
    await promise;
    expect(spy).toHaveBeenCalled();
  });

  test('onAction', async () => {
    const spy = jest.fn();
    themeStore.onAction('setTheme', spy);

    expect(spy).not.toHaveBeenCalled();
    themeStore.actions.setTheme('dark');
    expect(spy).toHaveBeenCalledWith('dark');
  });
});
