/**
 * Estimador de RTT e Temporizador de Retransmissão TCP (RFC 6298 / Kurose & Ross Seção 3.5.3).
 *
 * Fórmulas:
 * EstimatedRTT = (1 - α) * EstimatedRTT + α * SampleRTT     (α = 0.125)
 * DevRTT       = (1 - β) * DevRTT + β * |SampleRTT - EstimatedRTT| (β = 0.25)
 * TimeoutInterval = EstimatedRTT + 4 * DevRTT
 */
export class RTTEstimator {
  private estimatedRTT: number;
  private devRTT: number;
  private timeoutInterval: number;
  private readonly alpha = 0.125;
  private readonly beta = 0.25;
  private readonly minTimeout = 100; // ms mínimo no relógio virtual

  constructor(initialEstimatedRTT: number = 200, initialDevRTT: number = 50) {
    this.estimatedRTT = initialEstimatedRTT;
    this.devRTT = initialDevRTT;
    this.timeoutInterval = Math.max(
      this.minTimeout,
      this.estimatedRTT + 4 * this.devRTT,
    );
  }

  /**
   * Atualiza as estimativas com uma nova medição válida (Algoritmo de Karn: não computar para retransmissões)
   */
  public updateSample(sampleRTT: number): {
    estimatedRTT: number;
    devRTT: number;
    timeoutInterval: number;
  } {
    const error = Math.abs(sampleRTT - this.estimatedRTT);
    this.devRTT = (1 - this.beta) * this.devRTT + this.beta * error;
    this.estimatedRTT =
      (1 - this.alpha) * this.estimatedRTT + this.alpha * sampleRTT;

    this.timeoutInterval = Math.max(
      this.minTimeout,
      this.estimatedRTT + 4 * this.devRTT,
    );

    return {
      estimatedRTT: this.estimatedRTT,
      devRTT: this.devRTT,
      timeoutInterval: this.timeoutInterval,
    };
  }

  public getTimeoutInterval(): number {
    return this.timeoutInterval;
  }

  public getEstimatedRTT(): number {
    return this.estimatedRTT;
  }

  public getDevRTT(): number {
    return this.devRTT;
  }

  public reset(initialEstimatedRTT: number = 200, initialDevRTT: number = 50): void {
    this.estimatedRTT = initialEstimatedRTT;
    this.devRTT = initialDevRTT;
    this.timeoutInterval = Math.max(
      this.minTimeout,
      this.estimatedRTT + 4 * this.devRTT,
    );
  }
}
