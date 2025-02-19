import { type ActionKeyToPayload, type ActionRewrite, type DuckOptions, duck } from '../duck';

export type SharedDuckPortMessage = {
  portId: string;
  event: string;
  name: string;
  data: any;
}

export type SharedDuckPortMessageHandler = (message: SharedDuckPortMessage) => void;

export interface SharedDuckPort {
  id: string;
  send: (id: string, message: SharedDuckPortMessage) => void;
  onMessage: (handler: SharedDuckPortMessageHandler) => void;
}

export type SharedDuckOptions<S, KTP extends ActionKeyToPayload> = DuckOptions<S, KTP> & {
  name: string;
  port: SharedDuckPort;
};

export const MASTER_PORT_ID = 'master';

const delay = () => new Promise(resolve => setTimeout(resolve, 0));

export const sharedDuck = <S, KTP extends ActionKeyToPayload>(options: SharedDuckOptions<S, KTP>) => {
  const { name, port } = options;

  if (port.id === MASTER_PORT_ID) {
    const mirrorPortIdSet = new Set<string>();
    const actionRewrite: ActionRewrite = ({ action, payload }, origin) => {
      mirrorPortIdSet.forEach(portId => {
        port.send(portId, {
          event: 'forward/replica',
          portId: MASTER_PORT_ID,
          name: options.name,
          data: { action, payload },
        })
      });
      return origin(...payload);
    };
    options = {
      initialize: async (api, resolve) => {
        // delay 0s
        await delay();

        port.onMessage(message => {
          if (message.name !== options.name) { return; }

          switch (message.event) {
            case 'state/request': {
              mirrorPortIdSet.add(message.portId);
              const state = api.getState();
              port.send(message.portId, {
                event: 'state/response',
                name: options.name,
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
                  name: options.name,
                  data: message.data,
                });
                api.originActions[message.data.action](...message.data.payload);
              });
              break;
            }
          }
        });
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

        port.onMessage(message => {
          if (message.name !== options.name) { return; }

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

        port.send(MASTER_PORT_ID, {
          event: 'state/request',
          name: options.name,
          portId: port.id,
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
