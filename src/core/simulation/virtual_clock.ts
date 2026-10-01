export interface ScheduledTimer {
  id: string;
  fireAtTime: number;
  description: string;
  callback: () => void;
}

/**
 * Relógio Virtual e Fila de Eventos Discretos (Discrete Event Simulation - DES).
 * Atende ao Requisito Não Funcional:
 * - Timers não dependem de tempo real do sistema (wall-clock);
 * - Testes automatizados executam instantaneamente saltando o tempo virtual;
 * - A interface gráfica pode avançar o relógio virtual passo a passo ou por ticks acelerados.
 */
export class VirtualClock {
  private currentTime: number = 0;
  private timers: ScheduledTimer[] = [];
  private timerCounter: number = 0;

  public getTime(): number {
    return this.currentTime;
  }

  public reset(): void {
    this.currentTime = 0;
    this.timers = [];
    this.timerCounter = 0;
  }

  public schedule(delayMs: number, callback: () => void, description: string): string {
    const id = `timer_${++this.timerCounter}`;
    const fireAtTime = this.currentTime + Math.max(0, delayMs);

    this.timers.push({
      id,
      fireAtTime,
      description,
      callback,
    });

    // Mantém ordenado pelo tempo de disparo
    this.timers.sort((a, b) => a.fireAtTime - b.fireAtTime);
    return id;
  }

  public cancel(timerId: string): boolean {
    const idx = this.timers.findIndex((t) => t.id === timerId);
    if (idx !== -1) {
      this.timers.splice(idx, 1);
      return true;
    }
    return false;
  }

  public hasScheduledTimers(): boolean {
    return this.timers.length > 0;
  }

  public getNextTimerTime(): number | null {
    return this.timers.length > 0 ? this.timers[0].fireAtTime : null;
  }

  public getPendingTimers(): ScheduledTimer[] {
    return [...this.timers];
  }

  /**
   * Salta o relógio diretamente para o próximo evento agendado e o executa.
   */
  public stepToNext(): boolean {
    if (this.timers.length === 0) return false;

    const next = this.timers.shift()!;
    this.currentTime = next.fireAtTime;
    next.callback();
    return true;
  }

  /**
   * Avança o relógio por um delta fixo de milissegundos e dispara todos os timers vencidos.
   */
  public advance(deltaMs: number): number {
    const targetTime = this.currentTime + deltaMs;
    let firedCount = 0;

    while (this.timers.length > 0 && this.timers[0].fireAtTime <= targetTime) {
      const next = this.timers.shift()!;
      this.currentTime = next.fireAtTime;
      next.callback();
      firedCount++;
    }

    this.currentTime = targetTime;
    return firedCount;
  }
}
