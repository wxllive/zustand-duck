import { type ActionKeyToPayload, type ActionRewrite, type DuckOptions, duck } from '../duck';
import { SharedDuckChannels } from './shared-duck-channel';

export type SharedDuckPortMessage = {
  portId: string;
  event: string;
  channel: string;
  name: string;
  data: any;
}

export type SharedDuckPortMessageHandler = (message: SharedDuckPortMessage) => void;

export interface SharedDuckPort {
  id: string;
  send: (id: string, message: SharedDuckPortMessage) => void;
  onMessage: (handler: SharedDuckPortMessageHandler) => () => void;
}

export type SharedDuckOptions<S, KTP extends ActionKeyToPayload> = DuckOptions<S, KTP> & {
  name: string;
  port: SharedDuckPort;
  channel?: string;
  channels?: SharedDuckChannels,
};

export const MASTER_PORT_ID = 'master';

const delay = () => new Promise(resolve => setTimeout(resolve, 0));

export const sharedDuck = <S, KTP extends ActionKeyToPayload>(options: SharedDuckOptions<S, KTP>) => {
  const { name, port, channel = '', channels } = options;
  const unsubscribeList: (() => void)[] = [];

  if (channels) {
    let unsubscribeChannel = channels.subscribe((_channel, event) => {
      if (_channel === channel && event === 'remove') {
        unsubscribeChannel();
        unsubscribeList.forEach(fn => fn());
      }
    });
  }

  if (port.id === MASTER_PORT_ID) {
    const mirrorPortIdSet = new Set<string>();
    const actionRewrite: ActionRewrite = ({ action, payload }, origin) => {
      mirrorPortIdSet.forEach(portId => {
        port.send(portId, {
          event: 'forward/replica',
          portId: MASTER_PORT_ID,
          name,
          channel,
          data: { action, payload },
        })
      });
      return origin(...payload);
    };
    options = {
      initialize: async (api, resolve) => {
        if (channel === (channels?.default ?? '')) {
          // only default channel need delay 0s
          // beause other channel always create later
          await delay();
        }

        const unsubscribe = port.onMessage(message => {
          if (message.name !== name) { return; }
          // only default channel handle register event
          if (channel === channels?.default && message.event === 'register/replica') {
            channels?.notify(message.channel, 'add');
            port.send(message.portId, {
              event: 'register/success',
              name,
              channel: message.channel,
              portId: MASTER_PORT_ID,
              data: {},
            });
            return;
          }
          if (message.channel !== channel) { return; }

          switch (message.event) {
            case 'state/request': {
              mirrorPortIdSet.add(message.portId);
              const state = api.getState();
              port.send(message.portId, {
                event: 'state/response',
                name,
                channel,
                portId: MASTER_PORT_ID,
                data: state,
              });
              break;
            }
            case 'forward/master': {
              mirrorPortIdSet.forEach(portId => {
                port.send(portId, {
                  event: 'forward/replica',
                  portId: MASTER_PORT_ID,
                  name,
                  channel,
                  data: message.data,
                });
                api.originActions[message.data.action](...message.data.payload);
              });
              break;
            }
          }
        });

        unsubscribeList.push(unsubscribe);
        resolve(api);
      },
      actionRewrite,
      ...options,
    };
  } else {
    let localId = 0;
    const actionResolveMap = new Map<string, (value: any) => void>();
    const actionRewrite: ActionRewrite = ({ action, payload }, origin) => {
      const actionId = `${port.id}_${localId++}`;

      port.send(MASTER_PORT_ID, {
        event: 'forward/master',
        portId: port.id,
        name,
        channel,
        data: {
          id: actionId,
          action,
          payload,
        },
      });
      const promise = new Promise<any[]>(resolve => actionResolveMap.set(actionId, resolve));
      return promise;
    };

    options = {
      initialize: async (api, resolve) => {
        await delay();

        const unsubscribe = port.onMessage(message => {
          if (message.name !== name) { return; }
          if (message.channel !== channel) { return; }

          switch (message.event) {
            case 'state/response': {
              api.setState(message.data);
              resolve(api);
              break;
            }
            case 'forward/replica': {
              api.originActions[message.data.action](...message.data.payload);
              const resolve = message.data.id && actionResolveMap.get(message.data.id);
  
              if (resolve) {
                resolve(message.data.payload);
                actionResolveMap.delete(message.data.id!);
              }
              break;
            }
          }
        });
        unsubscribeList.push(unsubscribe);

        if (channels) {
          await new Promise(resolve => {
            // register replica
            const unsubscribe = port.onMessage((message) => {
              if (message.name !== name) { return; }
              if (message.channel !== channel) { return; }
              if (message.event === 'register/success') {
                resolve(void 0);
                unsubscribe();
              }
            });
            unsubscribeList.push(unsubscribe);
            port.send(MASTER_PORT_ID, {
              event: 'register/replica',
              name,
              portId: port.id,
              channel,
              data: {},
            });
          });
        }

        port.send(MASTER_PORT_ID, {
          event: 'state/request',
          name,
          portId: port.id,
          channel,
          data: {},
        });
      },
      actionRewrite,
      ...options,
    };
  }

  return duck<S, KTP>({
    ...options,
  });
};
