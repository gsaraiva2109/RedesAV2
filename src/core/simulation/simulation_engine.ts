import {
  ChannelConfig,
  NetworkPacket,
  ProtocolType,
  SequenceDiagramItem,
  SimStats,
  TCPSegment,
  UDPDatagram,
} from '../types';
import { VirtualClock } from './virtual_clock';
import { SimEventBus } from '../events/event_bus';
import { SimulatedChannel } from './channel';
import { TCPEndpoint } from '../protocols/tcp/tcp_endpoint';
import { UDPEndpoint } from '../protocols/udp';

export class SimulationEngine {
  public protocol: ProtocolType;
  public clock: VirtualClock;
  public eventBus: SimEventBus;
  public channel: SimulatedChannel;

  // Endpoints TCP
  public tcpHostA: TCPEndpoint;
  public tcpHostB: TCPEndpoint;

  // Endpoints UDP
  public udpHostA: UDPEndpoint;
  public udpHostB: UDPEndpoint;

  // Estatísticas e rastreamento para o diagrama de sequência
  public sequenceItems: SequenceDiagramItem[] = [];
  public stats: SimStats;

  constructor(
    protocol: ProtocolType = 'TCP',
    channelConfig?: Partial<ChannelConfig>,
  ) {
    this.protocol = protocol;
    this.clock = new VirtualClock();
    this.eventBus = new SimEventBus();

    const defaultConfig: ChannelConfig = {
      lossRate: 0,
      minDelayMs: 20,
      maxDelayMs: 40,
      corruptionRate: 0,
      duplicationRate: 0,
      reorderRate: 0,
      dropNextSegment: false,
      seed: 42,
      ...channelConfig,
    };

    this.channel = new SimulatedChannel(defaultConfig, this.clock, this.eventBus);

    // Inicialização dos Endpoints
    this.tcpHostA = new TCPEndpoint('Host A', 10001, this.clock, this.eventBus, 100);
    this.tcpHostB = new TCPEndpoint('Host B', 80, this.clock, this.eventBus, 500);

    this.udpHostA = new UDPEndpoint('Host A', 10001, this.clock, this.eventBus);
    this.udpHostB = new UDPEndpoint('Host B', 53, this.clock, this.eventBus);

    this.stats = {
      packetsSent: 0,
      packetsDelivered: 0,
      packetsLost: 0,
      packetsCorrupted: 0,
      packetsDuplicated: 0,
      retransmissions: 0,
      deliveredInOrder: 0,
      totalVirtualTime: 0,
    };

    this.bindCallbacks();
  }

  private bindCallbacks(): void {
    // Configura transmissão de pacotes dos endpoints para o canal
    const sendFromHost = (packet: NetworkPacket, fromHost: 'A' | 'B', toHost: 'A' | 'B') => {
      this.stats.packetsSent++;
      if ('isRetransmission' in packet && packet.isRetransmission) {
        this.stats.retransmissions++;
      }

      // Adiciona ao diagrama de sequência
      const seqItem: SequenceDiagramItem = {
        id: `seq_${packet.id}_${this.clock.getTime()}`,
        packet,
        fromHost,
        toHost,
        startTime: this.clock.getTime(),
        endTime: this.clock.getTime() + this.channel.getConfig().minDelayMs,
        status: 'in_flight',
        isRetransmission: ('isRetransmission' in packet && !!packet.isRetransmission),
        label: this.formatPacketLabel(packet),
      };
      this.sequenceItems.push(seqItem);

      this.channel.transmit(packet, fromHost, toHost);
    };

    this.tcpHostA.setSendPacketCallback((pkt) => sendFromHost(pkt, 'A', 'B'));
    this.tcpHostB.setSendPacketCallback((pkt) => sendFromHost(pkt, 'B', 'A'));
    this.udpHostA.setSendPacketCallback((pkt) => sendFromHost(pkt, 'A', 'B'));
    this.udpHostB.setSendPacketCallback((pkt) => sendFromHost(pkt, 'B', 'A'));

    // Configura entrega do canal para o endpoint de destino
    this.channel.setDeliveryCallback((packet, fromHost, toHost) => {
      // Atualiza item correspondente no diagrama de sequência
      const item = this.sequenceItems
        .slice()
        .reverse()
        .find((s) => s.packet.id === packet.id);

      if (item) {
        item.endTime = this.clock.getTime();
        item.status = 'delivered';
      }

      this.stats.packetsDelivered++;

      if (packet.protocol === 'TCP') {
        const tcpSeg = packet as TCPSegment;
        if (toHost === 'B') {
          this.tcpHostB.receive(tcpSeg);
        } else {
          this.tcpHostA.receive(tcpSeg);
        }
      } else {
        const udpDatagram = packet as UDPDatagram;
        if (toHost === 'B') {
          this.udpHostB.receive(udpDatagram);
        } else {
          this.udpHostA.receive(udpDatagram);
        }
      }
    });

    // Escuta eventos de perda/corrupção para atualizar status no diagrama e estatísticas
    this.eventBus.subscribe((entry) => {
      if (entry.type === 'PACKET_LOST') {
        this.stats.packetsLost++;
        if (entry.packetId) {
          const item = this.sequenceItems
            .slice()
            .reverse()
            .find((s) => s.packet.id === entry.packetId);
          if (item) item.status = 'lost';
        }
      } else if (entry.type === 'PACKET_CORRUPTED') {
        this.stats.packetsCorrupted++;
        if (entry.packetId) {
          const item = this.sequenceItems
            .slice()
            .reverse()
            .find((s) => s.packet.id === entry.packetId);
          if (item) item.status = 'corrupted';
        }
      } else if (entry.type === 'PACKET_DUPLICATED') {
        this.stats.packetsDuplicated++;
      }
    });
  }

  private formatPacketLabel(packet: NetworkPacket): string {
    if (packet.protocol === 'TCP') {
      const seg = packet as TCPSegment;
      const flags: string[] = [];
      if (seg.flags.syn) flags.push('SYN');
      if (seg.flags.ack) flags.push(`ACK=${seg.ackNumber}`);
      if (seg.flags.fin) flags.push('FIN');
      if (seg.flags.rst) flags.push('RST');

      let label = flags.join(' ');
      if (seg.data) {
        label += ` SEQ=${seg.seqNumber} [${seg.data.length}B]`;
      } else {
        label += ` SEQ=${seg.seqNumber}`;
      }
      return label;
    } else {
      const udp = packet as UDPDatagram;
      return `UDP len=${udp.length} cksum=0x${udp.checksum.toString(16).padStart(4, '0')}`;
    }
  }

  public setProtocol(protocol: ProtocolType): void {
    this.protocol = protocol;
    this.reset();
  }

  public reset(seed?: number): void {
    this.clock.reset();
    this.eventBus.clear();
    this.sequenceItems = [];
    this.stats = {
      packetsSent: 0,
      packetsDelivered: 0,
      packetsLost: 0,
      packetsCorrupted: 0,
      packetsDuplicated: 0,
      retransmissions: 0,
      deliveredInOrder: 0,
      totalVirtualTime: 0,
    };

    if (seed !== undefined) {
      this.channel.updateConfig({ seed });
    }

    this.tcpHostA.reset(100);
    this.tcpHostB.reset(500);
    this.udpHostA.reset();
    this.udpHostB.reset();
  }

  public triggerDropNext(): void {
    this.channel.triggerDropNext();
  }

  public step(): boolean {
    const executed = this.clock.stepToNext();
    this.stats.totalVirtualTime = this.clock.getTime();
    return executed;
  }

  public advanceTime(deltaMs: number): number {
    const fired = this.clock.advance(deltaMs);
    this.stats.totalVirtualTime = this.clock.getTime();
    return fired;
  }

  /**
   * Executa a simulação até que a fila de eventos discretos esteja vazia ou até maxSteps.
   * Método fundamental para execução instantânea dos testes automatizados (Headless).
   */
  public runUntilQuiet(maxSteps: number = 2000): number {
    let steps = 0;
    while (this.clock.hasScheduledTimers() && steps < maxSteps) {
      this.step();
      steps++;
    }
    return steps;
  }
}
