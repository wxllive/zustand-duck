import { Mutate, StoreApi, StoreMutatorIdentifier, UseBoundStore } from "zustand";

export type SharedDuckChannelListener = (channel: string, event: 'add' | 'remove') => void;

export class SharedDuckChannels {
  private defaultChannel = '';
  private listeners: SharedDuckChannelListener[] = [];

  get default () {
    return this.defaultChannel;
  }

  set default (channel: string) {
    this.defaultChannel = channel;
  }

  notify (channel: string, event: 'add' | 'remove') {
    this.listeners.forEach(fn => fn(channel, event));
  }

  subscribe (listener: SharedDuckChannelListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }
}

export const shareWithChannels = <
  T,
  Mos extends [StoreMutatorIdentifier, unknown][] = [],
  R = Mutate<StoreApi<T>, Mos>,
>(
  channels: SharedDuckChannels,
  creator: (channel: string) => R
): R & { channel: (name: string) => R } => {
  const storeMap = new Map<string, R>();
  const store: any = {};
  const getStoreWithChannel = (channel: string) => {
    if (!storeMap.has(channel)) {
      storeMap.set(channel, creator(channel));
    }
    return storeMap.get(channel);
  };

  channels.subscribe((channel, event) => {
    switch (event) {
      case 'add': {
        getStoreWithChannel(channel);
        break;
      }
      case 'remove': {
        storeMap.delete(channel);
        break;
      }
    }
  });

  // create default store listen port message
  getStoreWithChannel(channels.default);

  return new Proxy(store, {
    get: (target, key) => {
      if (key === 'channel') {
        return getStoreWithChannel;
      }
      if (store[key] !== void 0 || typeof key === 'symbol') {
        return store[key];
      }
      return (getStoreWithChannel(channels.default ?? '') as any)?.[key];
    },
    set: (target, key, value) => {
      store[key] = value;
      return true;
    },
  });
};
