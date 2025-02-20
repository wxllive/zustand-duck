import { SharedDuckPort } from "../../src";
import { Subscribe } from "./Subscribe";

export const portsMap = new Map<string, Subscribe<any>>();

export const createPort = (id: string) => {
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
