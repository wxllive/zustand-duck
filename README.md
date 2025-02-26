# zustand-duck

## Installation

```
npm i zustand-duck zustand
```

## Features

* Like redux, and write fewer typescript types
* Generate actions and support practical methods such as `ready` `wait` `onAction`
* Shared across processes, each process uses it in the same way
* Shared stores can be isolated by channel

## Usage

### Basic

```tsx
import { createStore } from 'zustand/vanilla';
import { duck } from 'zustand-duck';

interface ThemeState {
  theme: 'dark' | 'light';
}

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

// then you can use actions
themeStore.actions.setTheme('dark');
```

### Cross process share

Assuming we are developing an electron application, we have the following key files:

```
- src
  |- common-port.ts
  |- main.ts
  |- main-port.ts
  |- renderer.tsx
  |- renderer-port.ts
  |- theme-store.ts
```

The contents of the files are as follows:

```ts
// common-port.ts
import { SharedDuckPort } from 'zustand-duck';

// We need to leave the port field blank first and implement it differently in different processes.
export const port: SharedDuckPort = {
  id: '',
  send: () => (),
  onMessage: () => () => (),
};

```

```tsx
// theme-store.ts
import { createStore } from 'zustand/vanilla';
import { sharedDuck } from 'zustand-duck';
import { port } from './common-port';

interface ThemeState {
  theme: 'dark' | 'light';
}

const state: ThemeState = { theme: 'light' };

export const themeStore = createStore(
  sharedDuck({
    name: 'theme',
    state,
    port,
    reducers: {
      setTheme (state, theme: ThemeState['theme']) {
        return { ...state, theme };
      },
    },
  })
);
```

```tsx
// main-port.ts
import { MASTER_PORT_ID } from 'zustand-duck';
import { port } from './common-port';

port.id = MASTER_PORT_ID;
port.send = //...
port.onMessage = //...
```

```tsx
// main.ts
import './main-port';
import { themeStore } from './theme-store';

themeStore.subscribe(state => {
  console.log('change theme to', state.theme);
});

//...
```

```tsx
// renderer-port.ts
import { port } from './common-port';

port.id = // just custom;
port.send = //...
port.onMessage = //...
```

```tsx
// renderer.tsx
import './renderer-port';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { themeStore } from './theme-store';

const App = () => {
  const theme = useStore(themeStore, state => state.theme);

  return <div
    onClick={() => {
      themeStore.actions.setTheme(theme === 'light' ? 'dark' : 'light');
    }}
  >
    {theme}
  </div>
};

createRoot(document.getElementById('app')!).render(<App />);
```

The above shows the case where there is only one renderer process. In fact, there can be an unlimited number of renderer processes, and the data will only be synchronized in the process that imports `theme-store.ts`, and the same store is used for operations in any process.

### Cross process share with channels

If there are multiple groups of processes in a project and data needs to be synchronized within the group, channels can be used to isolate data between groups.

```ts
// channels.ts
import { SharedDuckChannels } from 'zustand-duck';

export const channels = new SharedDuckChannels();
```

```ts
// group1-setup.ts, set default channel
import { channels } from './channels';

channels.default = 'here is group id';
```

```ts
// group-store.ts
import { createStore } from 'zustand/vanilla';
import { sharedDuck, shareWithChannels } from 'zustand-duck';
import { port } from './common-port';

interface GroupState {
  groupName: string;
}

const state: GroupState = { groupName: 'unknown' };

export const groupStore = shareWithChannels(channels, (channel) => {
  return createStore(
    sharedDuck({
      name: 'group',
      state,
      port,
      channel,
      channels,
      reducers: {
        setGroupName (state, groupName: GroupState['groupName']) {
          return { ...state, groupName };
        },
      },
    })
  );
});
```

```tsx
// group1-index.tsx, group1 processes entry
import './group1-setup';
import './renderer-port';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from 'zustand';
import { groupStore } from './group-store';

const App = () => {
  const groupName = useStore(groupStore, state => state.groupName);

  return <div
    onClick={() => {
      groupStore.actions.setGroupName(`group1-${Math.random()}`);
    }}
  >
    {groupName}
  </div>
};

createRoot(document.getElementById('app')!).render(<App />);
```
