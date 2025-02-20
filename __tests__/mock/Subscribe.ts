type SubscribeHandler = (...args: any) => void;

export class Subscribe<E extends { [channel: string]: any }> {
  private listenerMapping = new Map<string, SubscribeHandler[]>();

  public trigger = <T extends keyof E>(channel: T, ...data: E[T]) => {
    // console.log('trigger', data);
    this.listenerMapping.get(String(channel))?.forEach(fn => fn(...(data as any)));
  };

  public on = <T extends keyof E>(channel: T, listener: (...data: E[T]) => void) => {
    const listeners = this.listenerMapping.get(String(channel)) || [];

    this.listenerMapping.set(String(channel), [...listeners, listener]);
    return () => {
      this.off(String(channel), listener);
    };
  };

  public off = <T extends keyof E>(channel: T, listener: SubscribeHandler) => {
    const listeners = this.listenerMapping.get(String(channel)) || [];
    this.listenerMapping.set(String(channel), listeners.filter(item => item !== listener));
  };

  public dispose () {
    this.listenerMapping = new Map();
  }
}