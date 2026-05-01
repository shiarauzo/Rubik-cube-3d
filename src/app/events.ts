import type { Move, Mode } from '../types';

export interface AppEvents {
  'move:applied': { move: Move; total: number };
  'cube:solved': void;
  'cube:reset': void;
  'cube:scrambled': { moves: Move[] };
  'solver:ready': void;
  'solver:solving': void;
  'solver:solution': { moves: Move[] };
  'solver:error': { message: string };
  'cv:error': { message: string };
  'cv:camera-on': void;
  'cv:camera-off': void;
  'mode:changed': { mode: Mode };
  'scan:progress': { faceIndex: number; total: number };
  'scan:complete': void;
  'toast': { message: string; kind?: 'info' | 'warn' | 'error' };
}

type Handler<E extends keyof AppEvents> = (payload: AppEvents[E]) => void;

export class EventBus {
  private listeners = new Map<keyof AppEvents, Set<Handler<keyof AppEvents>>>();

  on<E extends keyof AppEvents>(event: E, fn: Handler<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Handler<keyof AppEvents>);
    return () => set!.delete(fn as Handler<keyof AppEvents>);
  }

  emit<E extends keyof AppEvents>(event: E, payload: AppEvents[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) (fn as Handler<E>)(payload);
  }
}

export const bus = new EventBus();
