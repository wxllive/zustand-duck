import type { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand/vanilla';

export type ActionKeyToPayload = { [A: string]: any[] };

export type Reducers<S, KTP extends ActionKeyToPayload> = {
  [A in keyof KTP]: (state: S, ...args: KTP[A]) => S;
};

export type Actions<KTP extends ActionKeyToPayload> = {
  [A in keyof KTP]: (...args: KTP[A]) => KTP[A];
};

export type AsyncActions<KTP extends ActionKeyToPayload> = {
  [A in keyof KTP]: (...args: KTP[A]) => Promise<KTP[A]> | KTP[A];
};

export type ActionRewrite<P extends any[] = any[]> = (data: { action: string; payload: P }, origin: (...args: P) => P) => Promise<P> | P;

export type ReduxOptions<S, KTP extends ActionKeyToPayload> = {
  /**
   * 
   */
  name?: string;
  /**
   * Initial state
   */
  state: S;
  reducers: Reducers<S, KTP>;
  /**
   * Optional initialization function that determines the ready time
   */
  initialize?: (api: CustomStoreApi<S, KTP>, resolve: (value: any) => void) => void;
  /**
   * Action rewrite
   */
  actionRewrite?: ActionRewrite;
};

type CustomStoreApiMethods<S, KTP extends ActionKeyToPayload> = {
  actions: AsyncActions<KTP & { reset: [] }>;
  originActions: Actions<KTP & { reset: [] }>;
  ready: () => Promise<CustomStoreApi<S, KTP>>;
  wait: (condition: (state: S) => boolean) => Promise<CustomStoreApi<S, KTP>>;
  onAction: <K extends (keyof KTP | 'reset')>(action: K, listener: (...args: KTP[K]) => void) => () => void;
};

export type CustomStoreApi<S, KTP extends ActionKeyToPayload> = StoreApi<S> & CustomStoreApiMethods<S, KTP>;

type WithReduxSimilar<S, KTP> = S extends StoreApi<infer T>
  ? S & (KTP extends ActionKeyToPayload
    ? CustomStoreApiMethods<T, KTP>
    : never)
  : never;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'zustand/duck': WithReduxSimilar<S, A>
  }
}

export type ReduxSimilar = <
  T,
  A extends ActionKeyToPayload,
  Cms extends [StoreMutatorIdentifier, unknown][] = [],
>(options: ReduxOptions<T, A>) => StateCreator<T, Cms, [['zustand/duck', A]]>

const rawDuck = <S, KTP extends ActionKeyToPayload>(options: ReduxOptions<S, KTP>) =>
  (
    set: StoreApi<S>['setState'],
    get: StoreApi<S>['getState'],
    api: StoreApi<S>,
  ): S => {
    const { actionRewrite, initialize, reducers, state } = options;
    const listeners: { action: keyof KTP; listener: (...args: any) => void }[] = [];
    const originActions: Actions<any> = { reset: () => set({ ...state }, true) };
    const actions = { ...originActions };
    let readyResolve = (value: CustomStoreApi<S, KTP>) => {};
    const readyPromise = new Promise<CustomStoreApi<S, KTP>>(resolve => {
      readyResolve = resolve;
    });

    Object.keys(reducers).forEach(action => {
      originActions[action] = (...args: KTP[keyof KTP]) => {
        set((state: S) => reducers[action](state, ...args as unknown as any), true);

        listeners.forEach(item => {
          if (action === item.action) {
            item.listener(...args);
          }
        });

        return args;
      };
    });

    Object.keys(originActions).forEach(action => {
      actions[action] = actionRewrite
        ? (...payload: []) => actionRewrite({ action, payload }, originActions[action])
        : originActions[action];
    });

    const newAPI = api as unknown as CustomStoreApi<S, KTP>;

    newAPI.actions = actions as AsyncActions<KTP & { reset: [] }>;
    newAPI.originActions = originActions as Actions<KTP & { reset: [] }>;
    newAPI.ready = () => readyPromise;
    newAPI.wait = async (condition) => {
      await readyPromise;
      return new Promise(resolve => {
        if (condition(newAPI.getState())) {
          resolve(newAPI);
          return;
        }

        const unsubscribe = newAPI.subscribe((state) => {
          if (condition(state)) {
            unsubscribe();
            resolve(newAPI);
          }
        });
      });
    };
    newAPI.onAction = (action, listener) => {
      const data = { action, listener };

      listeners.push(data);

      return () => {
        const index = listeners.findIndex(item => item === data);
        listeners.splice(index, 1);
      };
    };

    initialize ? initialize(newAPI, readyResolve) : readyResolve(newAPI);

    return { ...state };
  };

export const duck = rawDuck as unknown as ReduxSimilar;
