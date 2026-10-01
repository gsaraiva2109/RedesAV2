import { ChannelConfig, NetworkPacket, SimLogEntry } from '../types';
import { DeterministicRNG } from './prng';
import { VirtualClock } from './virtual_clock';
import { SimEventBus } from '../events/event_bus';

export interface ChannelDeliveryCallback {
  (packet: NetworkPacket, fromHost: 'A' | 'B', toHost: 'A' | 'B'): void;
}

/**
 * Canal Simulado com Ruído e Atrasos Configuráveis (Requisito 4.5).
 * Modela perda de pacotes, corrupção de bits, atraso min/max, duplicação e descarte manual com 1 clique.
 */
export class SimulatedChannel {
  private config: ChannelConfig;
  private rng: DeterministicRNG;
  private clock: VirtualClock;
  private eventBus: SimEventBus;
  private deliveryCallback?: ChannelDeliveryCallback;

  constructor(
    config: ChannelConfig,
    clock: VirtualClock,
    eventBus: SimEventBus,
  ) {
    this.config = { ...config };
    this.rng = new DeterministicRNG(config.seed);
    this.clock = clock;
    this.eventBus = eventBus;
  }

  public setDeliveryCallback(cb: ChannelDeliveryCallback): void {
    this.deliveryCallback = cb;
  }

  public updateConfig(newConfig: Partial<ChannelConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.seed !== undefined) {
      this.rng.setSeed(newConfig.seed);
    }
  }

  public getConfig(): ChannelConfig {
    return { ...this.config };
  }

  public triggerDropNext(): void {
    this.config.dropNextSegment = true;
  }

  /**
   * Transmite um pacote pelo canal sujeito a imperfeições físicas simuladas.
   */
  public transmit(
    packet: NetworkPacket,
    fromHost: 'A' | 'B',
    toHost: 'A' | 'B',
  ): void {
    // 1. Descarte manual determinístico com 1 clique
    if (this.config.dropNextSegment) {
      this.config.dropNextSegment = false;
      this.eventBus.emit({
        virtualTime: this.clock.getTime(),
        host: 'Channel',
        event: 'MANUAL_DROP',
        action: 'DROP_PACKET',
        details: `[Descarte Manual] Pacote ${packet.protocol} #${packet.id} foi descartado intencionalmente pelo usuário.`,
        type: 'PACKET_LOST',
        packetId: packet.id,
      });
      return;
    }

    // 2. Perda probabilística configurável
    if (this.rng.next() < this.config.lossRate) {
      this.eventBus.emit({
        virtualTime: this.clock.getTime(),
        host: 'Channel',
        event: 'RANDOM_LOSS',
        action: 'DROP_PACKET',
        details: `[Perda no Canal] Pacote ${packet.protocol} #${packet.id} foi perdido (Probabilidade: ${(this.config.lossRate * 100).toFixed(1)}%).`,
        type: 'PACKET_LOST',
        packetId: packet.id,
      });
      return;
    }

    // Cria cópia para manipulação de corrupção
    let transmittedPacket = JSON.parse(JSON.stringify(packet)) as NetworkPacket;

    // 3. Corrupção probabilística de bits
    let wasCorrupted = false;
    if (this.rng.next() < this.config.corruptionRate) {
      wasCorrupted = true;
      // Inverte o checksum para simular corrupção indetectável no nível físico
      transmittedPacket.checksum = (transmittedPacket.checksum ^ 0xffff) & 0xffff;
      this.eventBus.emit({
        virtualTime: this.clock.getTime(),
        host: 'Channel',
        event: 'BIT_CORRUPTION',
        action: 'CORRUPT_PAYLOAD_OR_CHECKSUM',
        details: `[Corrupção no Canal] Pacote ${packet.protocol} #${packet.id} teve bits corrompidos no trânsito.`,
        type: 'PACKET_CORRUPTED',
        packetId: packet.id,
      });
    }

    // 4. Cálculo de atraso de propagação
    let delay = this.rng.nextRange(
      this.config.minDelayMs,
      this.config.maxDelayMs,
    );

    // 5. Reordenação (atraso extra se reordenado)
    if (this.rng.next() < this.config.reorderRate) {
      delay += this.config.maxDelayMs;
      this.eventBus.emit({
        virtualTime: this.clock.getTime(),
        host: 'Channel',
        event: 'PACKET_REORDER',
        action: 'APPLY_EXTRA_DELAY',
        details: `[Reordenação] Pacote ${packet.protocol} #${packet.id} sofreu atraso adicional de reordenação (+${this.config.maxDelayMs}ms).`,
        type: 'LOG_MESSAGE',
        packetId: packet.id,
      });
    }

    // 6. Duplicação probabilística
    const shouldDuplicate = this.rng.next() < this.config.duplicationRate;

    // Agenda a entrega principal no Relógio Virtual
    this.clock.schedule(
      delay,
      () => {
        if (this.deliveryCallback) {
          this.deliveryCallback(transmittedPacket, fromHost, toHost);
        }
      },
      `Entrega de pacote #${packet.id} de ${fromHost} para ${toHost}`,
    );

    // Se duplicado, agenda uma segunda entrega logo em seguida
    if (shouldDuplicate) {
      const dupDelay = delay + 15;
      const dupCopy = JSON.parse(JSON.stringify(transmittedPacket)) as NetworkPacket;
      this.eventBus.emit({
        virtualTime: this.clock.getTime(),
        host: 'Channel',
        event: 'PACKET_DUPLICATION',
        action: 'CREATE_DUPLICATE_PACKET',
        details: `[Duplicação] Pacote ${packet.protocol} #${packet.id} foi duplicado pelo canal.`,
        type: 'PACKET_DUPLICATED',
        packetId: packet.id,
      });

      this.clock.schedule(
        dupDelay,
        () => {
          if (this.deliveryCallback) {
            this.deliveryCallback(dupCopy, fromHost, toHost);
          }
        },
        `Entrega de duplicata do pacote #${packet.id} de ${fromHost} para ${toHost}`,
      );
    }
  }
}
