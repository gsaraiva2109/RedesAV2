/**
 * Gerador de Números Pseudo-Aleatórios Determinístico (Mulberry32).
 * Garante reprodutibilidade perfeita de testes e simulações com sementes (seeds) configuráveis.
 */
export class DeterministicRNG {
  private state: number;

  constructor(seed: number = 42) {
    this.state = seed >>> 0;
  }

  public setSeed(seed: number): void {
    this.state = seed >>> 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(this.nextRange(min, max + 1));
  }

  public nextBoolean(probability: number): boolean {
    return this.next() < probability;
  }
}
