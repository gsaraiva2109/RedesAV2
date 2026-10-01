import { UDPDatagram, ChannelConfig } from '../types';
import { FSMEngine } from '../fsm/fsm_engine';
import { SimEventBus } from '../events/event_bus';
import { VirtualClock } from '../simulation/virtual_clock';
import { computeUDPChecksum, serializeUDPForChecksum, verify16BitChecksum } from './checksum';
import udpFsmDef from '../../../fsms/udp.json';

/**
 * Endpoint UDP (Requisitos 4.2, 4.7 Cenários 8 e 9).
 * Modelo sem conexão (Single State):
 * - Envio com cálculo real do Checksum de 16 bits;
 * - Recepção: se checksum inválido, descarta silenciosamente;
 * - Sem handshakes, sem ordenação, sem ACKs e sem retransmissões.
 */
export class UDPEndpoint {
  public readonly hostName: 'Host A' | 'Host B';
  public readonly port: number;
  private fsm: FSMEngine;
  private clock: VirtualClock;
  private eventBus: SimEventBus;
  private sendPacketCallback?: (packet: UDPDatagram) => void;
  public receivedMessages: string[] = [];
  public droppedCount: number = 0;

  constructor(
    hostName: 'Host A' | 'Host B',
    port: number,
    clock: VirtualClock,
    eventBus: SimEventBus,
  ) {
    this.hostName = hostName;
    this.port = port;
    this.clock = clock;
    this.eventBus = eventBus;
    this.fsm = new FSMEngine(udpFsmDef);
  }

  public setSendPacketCallback(cb: (packet: UDPDatagram) => void): void {
    this.sendPacketCallback = cb;
  }

  public getCurrentState(): string {
    return this.fsm.getCurrentState();
  }

  public reset(): void {
    this.fsm.reset();
    this.receivedMessages = [];
    this.droppedCount = 0;
  }

  /**
   * Envia um datagrama UDP calculando o checksum real de 16 bits
   */
  public send(destinationPort: number, payload: string): UDPDatagram {
    const payloadBytes = new TextEncoder().encode(payload);
    const length = 8 + payloadBytes.length;
    const checksum = computeUDPChecksum(this.port, destinationPort, payload);

    const datagram: UDPDatagram = {
      protocol: 'UDP',
      id: `udp_${Math.random().toString(36).substring(2, 7)}`,
      srcPort: this.port,
      dstPort: destinationPort,
      length,
      checksum,
      data: payload,
      sentAtVirtualTime: this.clock.getTime(),
    };

    const trans = this.fsm.trigger('APPL_SEND');
    this.eventBus.emit({
      virtualTime: this.clock.getTime(),
      host: this.hostName,
      previousState: trans.previousState,
      event: 'APPL_SEND',
      action: trans.action || 'SEND_DATAGRAM',
      newState: trans.newState,
      details: `[UDP Envio] Datagrama #${datagram.id} (${length}B, Checksum: 0x${checksum.toString(16).padStart(4, '0')}): "${payload}"`,
      type: 'PACKET_SENT',
      packetId: datagram.id,
    });

    if (this.sendPacketCallback) {
      this.sendPacketCallback(datagram);
    }

    return datagram;
  }

  /**
   * Recebe um datagrama UDP e valida o checksum real
   */
  public receive(datagram: UDPDatagram): void {
    // Serializa os bytes com o checksum recebido para verificação em complemento de 1
    const buffer = serializeUDPForChecksum(
      datagram.srcPort,
      datagram.dstPort,
      datagram.length,
      datagram.checksum,
      datagram.data,
    );

    const isValid = verify16BitChecksum(buffer);

    if (!isValid) {
      this.droppedCount++;
      const trans = this.fsm.trigger('RECV_DATAGRAM', (cond) => cond === '!valid_checksum');
      this.eventBus.emit({
        virtualTime: this.clock.getTime(),
        host: this.hostName,
        previousState: trans.previousState,
        event: 'RECV_DATAGRAM',
        condition: '!valid_checksum',
        action: trans.action || 'DROP_SILENTLY',
        newState: trans.newState,
        details: `[UDP Checksum Inválido] Datagrama #${datagram.id} corrompido! Descartado silenciosamente pelo receptor sem notificar o remetente.`,
        type: 'PACKET_LOST',
        packetId: datagram.id,
      });
      return;
    }

    // Checksum válido
    const trans = this.fsm.trigger('RECV_DATAGRAM', (cond) => cond === 'valid_checksum');
    this.receivedMessages.push(datagram.data);

    this.eventBus.emit({
      virtualTime: this.clock.getTime(),
      host: this.hostName,
      previousState: trans.previousState,
      event: 'RECV_DATAGRAM',
      condition: 'valid_checksum',
      action: trans.action || 'DELIVER_DATA',
      newState: trans.newState,
      details: `[UDP Entrega] Datagrama #${datagram.id} entregue com sucesso à aplicação: "${datagram.data}"`,
      type: 'APPLICATION_DELIVERY',
      packetId: datagram.id,
    });
  }
}
