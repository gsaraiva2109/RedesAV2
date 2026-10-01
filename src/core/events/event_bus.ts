import { SimLogEntry, SimEventType } from '../types';

export type SimEventListener = (entry: SimLogEntry) => void;

/**
 * Barramento central de eventos da simulação.
 * Conecta o núcleo (Core) aos visualizadores da interface gráfica e registradores de teste.
 */
export class SimEventBus {
  private listeners: SimEventListener[] = [];
  private logs: SimLogEntry[] = [];
  private logIdCounter: number = 0;

  public subscribe(listener: SimEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public emit(entry: Omit<SimLogEntry, 'id'>): SimLogEntry {
    const fullEntry: SimLogEntry = {
      ...entry,
      id: `log_${++this.logIdCounter}`,
    };

    this.logs.push(fullEntry);
    for (const listener of this.listeners) {
      listener(fullEntry);
    }
    return fullEntry;
  }

  public getLogs(): SimLogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
    this.logIdCounter = 0;
  }
}
