import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import { duck } from '../src';
import { create } from 'zustand';

interface ThemeState {
    theme: 'dark' | 'light';
}

describe('duck', () => {
    const state: ThemeState = { theme: 'light' };
    const useTheme = create<ThemeState>()(
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
        useTheme.actions.reset();
    });

    test('dispatch action', async () => {
        expect(useTheme.actions.setTheme).toBeDefined();
        expect(useTheme.getState().theme).toBe('light');

        useTheme.actions.setTheme('dark');

        expect(useTheme.getState().theme).toBe('dark');
    });

    test('wait', async () => {
        const spy = jest.fn();
        const promise = useTheme.wait(state => state.theme === 'dark').then(spy);

        expect(spy).not.toHaveBeenCalled();
        useTheme.actions.setTheme('dark');
        await promise;
        expect(spy).toHaveBeenCalled();
    });

    test('onAction', async () => {
        const spy = jest.fn();
        useTheme.onAction('setTheme', spy);

        expect(spy).not.toHaveBeenCalled();
        useTheme.actions.setTheme('dark');
        expect(spy).toHaveBeenCalledWith('dark');
    });
});
