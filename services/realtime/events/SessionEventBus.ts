import { EventEmitter } from 'node:events';

import type { ServerEvent } from '../types';

type SessionEventHandler = (event: ServerEvent) => void;

export class SessionEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: ServerEvent) {
    this.emitter.emit('message', event);
  }

  subscribe(handler: SessionEventHandler): () => void {
    this.emitter.on('message', handler);
    return () => this.emitter.off('message', handler);
  }
}
