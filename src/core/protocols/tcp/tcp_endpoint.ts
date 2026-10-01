import { TCPSegment, TCPFlags } from '../../types';
import { FSMEngine } from '../../fsm/fsm_engine';
import { SimEventBus } from '../../events/event_bus';
import { VirtualClock } from '../../simulation/virtual_clock';
import { RTTEstimator } from './rtt';
import { computeTCPChecksum } from '../checksum';
import tcpFsmDef from '../../../../fsms/tcp.json';

interface PendingPacket {
  segment: TCPSegment;
  sentAt: number;
  timerId?: string;
  isRetransmission?: boolean;
}

/**
 * Implementação completa do Endpoint TCP (Requisitos 4.3, 4.4, 4.7 Cenários 1 a 7).
 * - Máquina de estados formal de 11 estados carregada de tcp.json
 * - Handshake 3 vias e Encerramento 4 vias (incluindo CLOSING simultâneo e TIME_WAIT 2*MSL)
 * - Numeração real de sequência e ACK cumulativo
 * - Estimador de RTT (RFC 6298)
 * - Retransmissão rápida (Fast Retransmit) ao atingir 3 ACKs duplicados
 * - Tratamento de porta fechada com envio de RST
 */
export class TCPEndpoint {
  public readonly hostName: 'Host A' | 'Host B';
  public readonly port: number;
  private fsm: FSMEngine;
  private clock: VirtualClock;
  private eventBus: SimEventBus;
  public rttEstimator: RTTEstimator;

  // Estado da conexão TCP
  public isn: number;
  public nextSeqNum: number;
  public sendBase: number;
  public rcvNxt: number;
  public dupAckCount: number = 0;
  public fastRetransmitCount: number = 0;
  public receivedData: string[] = [];
  public timeWaitDurationMs: number = 200; // 2 * MSL acelerável

  // Filas de envio e timers
  private unackedPackets: PendingPacket[] = [];
  private dataRetransmitTimerId?: string;
  private synTimerId?: string;
  private synAckTimerId?: string;
  private finTimerId?: string;
  private timeWaitTimerId?: string;

  private sendPacketCallback?: (packet: TCPSegment) => void;

  constructor(
    hostName: 'Host A' | 'Host B',
    port: number,
    clock: VirtualClock,
    eventBus: SimEventBus,
    isn: number = 100,
  ) {
    this.hostName = hostName;
    this.port = port;
    this.clock = clock;
    this.eventBus = eventBus;
    this.fsm = new FSMEngine(tcpFsmDef);
    this.rttEstimator = new RTTEstimator(200, 50);

    this.isn = isn;
    this.nextSeqNum = isn;
    this.sendBase = isn;
    this.rcvNxt = 0;
  }

  public setSendPacketCallback(cb: (packet: TCPSegment) => void): void {
    this.sendPacketCallback = cb;
  }

  public getCurrentState(): string {
    return this.fsm.getCurrentState();
  }

  public getFSMDefinition() {
    return this.fsm.getDefinition();
  }

  public reset(newIsn?: number): void {
    this.fsm.reset();
    this.clearAllTimers();
    this.isn = newIsn ?? (this.hostName === 'Host A' ? 100 : 500);
    this.nextSeqNum = this.isn;
    this.sendBase = this.isn;
    this.rcvNxt = 0;
    this.dupAckCount = 0;
    this.fastRetransmitCount = 0;
    this.receivedData = [];
    this.unackedPackets = [];
    this.rttEstimator.reset(200, 50);
  }

  private clearAllTimers(): void {
    if (this.dataRetransmitTimerId) this.clock.cancel(this.dataRetransmitTimerId);
    if (this.synTimerId) this.clock.cancel(this.synTimerId);
    if (this.synAckTimerId) this.clock.cancel(this.synAckTimerId);
    if (this.finTimerId) this.clock.cancel(this.finTimerId);
    if (this.timeWaitTimerId) this.clock.cancel(this.timeWaitTimerId);

    this.dataRetransmitTimerId = undefined;
    this.synTimerId = undefined;
    this.synAckTimerId = undefined;
    this.finTimerId = undefined;
    this.timeWaitTimerId = undefined;
  }

  private emitStateChange(prevState: string, newState: string, event: string, action: string, details: string) {
    this.eventBus.emit({
      virtualTime: this.clock.getTime(),
      host: this.hostName,
      previousState: prevState,
      event,
      action,
      newState,
      details,
      type: 'HOST_STATE_CHANGED',
    });
  }

  private transmit(segment: TCPSegment) {
    if (this.sendPacketCallback) {
      this.sendPacketCallback(segment);
    }
  }

  /**
   * Cria segmento TCP com checksum calculado
   */
  private createSegment(
    dstPort: number,
    flags: TCPFlags,
    seq: number,
    ack: number,
    data: string = '',
    isRetransmission: boolean = false,
  ): TCPSegment {
    const checksum = computeTCPChecksum(this.port, dstPort, seq, ack, flags, 65535, data);
    return {
      protocol: 'TCP',
      id: `tcp_${Math.random().toString(36).substring(2, 7)}`,
      srcPort: this.port,
      dstPort,
      seqNumber: seq,
      ackNumber: ack,
      flags,
      windowSize: 65535,
      checksum,
      data,
      isRetransmission,
      sentAtVirtualTime: this.clock.getTime(),
    };
  }

  // ==========================================
  // COMANDOS DE APLICAÇÃO
  // ==========================================

  public listen(): void {
    const res = this.fsm.trigger('APPL_LISTEN');
    if (res.success) {
      this.emitStateChange(res.previousState, res.newState, 'APPL_LISTEN', res.action!, 'Servidor ouvindo conexões');
    }
  }

  public connect(peerPort: number = 80): void {
    const res = this.fsm.trigger('APPL_CONNECT');
    if (!res.success) return;

    this.nextSeqNum = this.isn;
    this.sendBase = this.isn;

    const syn = this.createSegment(peerPort, { syn: true, ack: false, fin: false, rst: false }, this.nextSeqNum, 0);
    this.nextSeqNum += 1; // Consome 1 de seq

    this.emitStateChange(res.previousState, res.newState, 'APPL_CONNECT', res.action!, `SYN enviado (SEQ=${syn.seqNumber})`);

    // Inicia temporizador de retransmissão do SYN
    this.scheduleSYNTimer(peerPort, syn.seqNumber);

    this.transmit(syn);
  }

  private scheduleSYNTimer(peerPort: number, seq: number): void {
    if (this.synTimerId) this.clock.cancel(this.synTimerId);
    const timeout = this.rttEstimator.getTimeoutInterval();

    this.synTimerId = this.clock.schedule(
      timeout,
      () => {
        if (this.fsm.getCurrentState() === 'SYN_SENT') {
          const res = this.fsm.trigger('TIMEOUT_SYN');
          const reSyn = this.createSegment(peerPort, { syn: true, ack: false, fin: false, rst: false }, seq, 0, '', true);
          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: res.previousState,
            event: 'TIMEOUT_SYN',
            action: 'RETRANSMIT_SYN',
            newState: res.newState,
            details: `[Timeout SYN] Retransmitindo SYN (SEQ=${seq}) após ${timeout}ms`,
            type: 'PACKET_SENT',
            packetId: reSyn.id,
          });
          this.scheduleSYNTimer(peerPort, seq);
          this.transmit(reSyn);
        }
      },
      `Timeout de retransmissão de SYN do ${this.hostName}`,
    );
  }

  private scheduleSYNAckTimer(peerPort: number, seq: number, ack: number): void {
    if (this.synAckTimerId) this.clock.cancel(this.synAckTimerId);
    const timeout = this.rttEstimator.getTimeoutInterval();

    this.synAckTimerId = this.clock.schedule(
      timeout,
      () => {
        if (this.fsm.getCurrentState() === 'SYN_RCVD') {
          const res = this.fsm.trigger('TIMEOUT_SYN_ACK');
          const reSynAck = this.createSegment(peerPort, { syn: true, ack: true, fin: false, rst: false }, seq, ack, '', true);
          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: res.previousState,
            event: 'TIMEOUT_SYN_ACK',
            action: 'RETRANSMIT_SYN_ACK',
            newState: res.newState,
            details: `[Timeout SYN-ACK] Retransmitindo SYN-ACK (SEQ=${seq}, ACK=${ack}) após ${timeout}ms`,
            type: 'PACKET_SENT',
            packetId: reSynAck.id,
          });
          this.scheduleSYNAckTimer(peerPort, seq, ack);
          this.transmit(reSynAck);
        }
      },
      `Timeout de retransmissão de SYN-ACK do ${this.hostName}`,
    );
  }

  /**
   * Envia dados pela conexão estabelecida
   */
  public sendData(peerPort: number, payload: string): TCPSegment | null {
    const currentState = this.fsm.getCurrentState();
    if (currentState !== 'ESTABLISHED' && currentState !== 'CLOSE_WAIT') {
      this.eventBus.emit({
        virtualTime: this.clock.getTime(),
        host: this.hostName,
        event: 'APPL_SEND_DATA',
        action: 'REJECT',
        details: `Envio de dados rejeitado: estado atual é "${currentState}" (requer ESTABLISHED)`,
        type: 'LOG_MESSAGE',
      });
      return null;
    }

    const seq = this.nextSeqNum;
    const seg = this.createSegment(peerPort, { syn: false, ack: true, fin: false, rst: false }, seq, this.rcvNxt, payload);
    const dataLen = Math.max(1, payload.length);
    this.nextSeqNum += dataLen;

    this.unackedPackets.push({
      segment: seg,
      sentAt: this.clock.getTime(),
      isRetransmission: false,
    });

    this.eventBus.emit({
      virtualTime: this.clock.getTime(),
      host: this.hostName,
      previousState: currentState,
      event: 'APPL_SEND_DATA',
      action: 'SEND_DATA',
      newState: currentState,
      details: `[TCP Envio Dados] (SEQ=${seg.seqNumber}, Tamanho=${dataLen}B): "${payload}"`,
      type: 'PACKET_SENT',
      packetId: seg.id,
    });

    // Inicia temporizador de retransmissão se ainda não estiver ativo
    if (!this.dataRetransmitTimerId) {
      this.startDataRetransmitTimer(peerPort);
    }

    this.transmit(seg);
    return seg;
  }

  private startDataRetransmitTimer(peerPort: number): void {
    if (this.dataRetransmitTimerId) this.clock.cancel(this.dataRetransmitTimerId);
    const timeout = this.rttEstimator.getTimeoutInterval();

    this.dataRetransmitTimerId = this.clock.schedule(
      timeout,
      () => {
        this.dataRetransmitTimerId = undefined;
        if (this.unackedPackets.length > 0) {
          const oldest = this.unackedPackets[0];
          oldest.isRetransmission = true;

          const reSeg = this.createSegment(
            peerPort,
            oldest.segment.flags,
            oldest.segment.seqNumber,
            this.rcvNxt,
            oldest.segment.data,
            true,
          );

          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: this.fsm.getCurrentState(),
            event: 'TIMEOUT_DATA',
            action: 'RETRANSMIT_DATA',
            newState: this.fsm.getCurrentState(),
            details: `[Timeout Retransmissão] Timeout de ${timeout}ms expirou! Retransmitindo pacote mais antigo (SEQ=${reSeg.seqNumber})`,
            type: 'PACKET_SENT',
            packetId: reSeg.id,
          });

          this.startDataRetransmitTimer(peerPort);
          this.transmit(reSeg);
        }
      },
      `Timeout de retransmissão de dados do ${this.hostName}`,
    );
  }

  /**
   * Encerramento de conexão (Active Close ou continuação de Passive Close)
   */
  public close(peerPort: number = 80): void {
    const currentState = this.fsm.getCurrentState();

    if (currentState === 'LISTEN') {
      const res = this.fsm.trigger('APPL_CLOSE');
      this.emitStateChange(res.previousState, res.newState, 'APPL_CLOSE', res.action!, 'Porta em escuta fechada');
      return;
    }

    if (currentState === 'ESTABLISHED') {
      // Active Close
      const res = this.fsm.trigger('APPL_CLOSE');
      const fin = this.createSegment(peerPort, { syn: false, ack: true, fin: true, rst: false }, this.nextSeqNum, this.rcvNxt);
      this.nextSeqNum += 1;

      this.emitStateChange(res.previousState, res.newState, 'APPL_CLOSE', res.action!, `FIN enviado (SEQ=${fin.seqNumber}, ACK=${fin.ackNumber})`);
      this.scheduleFINTimer(peerPort, fin.seqNumber);
      this.transmit(fin);
      return;
    }

    if (currentState === 'CLOSE_WAIT') {
      // Passive Close final step
      const res = this.fsm.trigger('APPL_CLOSE');
      const fin = this.createSegment(peerPort, { syn: false, ack: true, fin: true, rst: false }, this.nextSeqNum, this.rcvNxt);
      this.nextSeqNum += 1;

      this.emitStateChange(res.previousState, res.newState, 'APPL_CLOSE', res.action!, `FIN enviado em resposta a CLOSE_WAIT (SEQ=${fin.seqNumber})`);
      this.scheduleFINTimer(peerPort, fin.seqNumber);
      this.transmit(fin);
      return;
    }
  }

  private scheduleFINTimer(peerPort: number, seq: number): void {
    if (this.finTimerId) this.clock.cancel(this.finTimerId);
    const timeout = this.rttEstimator.getTimeoutInterval();

    this.finTimerId = this.clock.schedule(
      timeout,
      () => {
        const state = this.fsm.getCurrentState();
        if (state === 'FIN_WAIT_1' || state === 'LAST_ACK') {
          const res = this.fsm.trigger('TIMEOUT_FIN');
          const reFin = this.createSegment(peerPort, { syn: false, ack: true, fin: true, rst: false }, seq, this.rcvNxt, '', true);
          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: res.previousState,
            event: 'TIMEOUT_FIN',
            action: 'RETRANSMIT_FIN',
            newState: res.newState,
            details: `[Timeout FIN] Retransmitindo FIN (SEQ=${seq}) após ${timeout}ms`,
            type: 'PACKET_SENT',
            packetId: reFin.id,
          });
          this.scheduleFINTimer(peerPort, seq);
          this.transmit(reFin);
        }
      },
      `Timeout de FIN do ${this.hostName}`,
    );
  }

  private startTimeWaitTimer(): void {
    if (this.timeWaitTimerId) this.clock.cancel(this.timeWaitTimerId);

    this.timeWaitTimerId = this.clock.schedule(
      this.timeWaitDurationMs,
      () => {
        const res = this.fsm.trigger('TIMEOUT_2MSL');
        this.emitStateChange(
          res.previousState,
          res.newState,
          'TIMEOUT_2MSL',
          'CLEANUP_CONNECTION',
          `Temporizador 2*MSL (${this.timeWaitDurationMs}ms) expirou com sucesso. Conexão liberada.`,
        );
      },
      `Timer 2*MSL do ${this.hostName}`,
    );
  }

  // ==========================================
  // RECEPÇÃO DE SEGMENTOS
  // ==========================================

  public receive(segment: TCPSegment): void {
    const currentState = this.fsm.getCurrentState();

    // 1. Cenário 7: Segmento recebido em porta fechada ou Host em CLOSED -> Envia RST
    if (currentState === 'CLOSED') {
      if (!segment.flags.rst) {
        const rst = this.createSegment(
          segment.srcPort,
          { syn: false, ack: true, fin: false, rst: true },
          segment.ackNumber || 0,
          segment.seqNumber + 1,
        );
        this.eventBus.emit({
          virtualTime: this.clock.getTime(),
          host: this.hostName,
          previousState: 'CLOSED',
          event: 'RECV_SEGMENT',
          action: 'SEND_RST',
          newState: 'CLOSED',
          details: `[Porta Fechada] Recebeu segmento em porta fechada. Enviando segmento RST em resposta (RST=1, SEQ=${rst.seqNumber}, ACK=${rst.ackNumber}).`,
          type: 'RST_GENERATED',
          packetId: rst.id,
        });
        this.transmit(rst);
      }
      return;
    }

    // 2. Se receber RST
    if (segment.flags.rst) {
      if (currentState === 'SYN_SENT') {
        const res = this.fsm.trigger('RECV_RST');
        this.emitStateChange(res.previousState, res.newState, 'RECV_RST', 'RESET_CONNECTION', 'Conexão rejeitada com RST pelo servidor.');
        this.clearAllTimers();
      } else if (currentState === 'SYN_RCVD') {
        const res = this.fsm.trigger('RECV_RST');
        this.emitStateChange(res.previousState, res.newState, 'RECV_RST', 'RETURN_TO_LISTEN', 'RST recebido; retornando ao estado LISTEN.');
        this.clearAllTimers();
      }
      return;
    }

    // 3. Estado LISTEN
    if (currentState === 'LISTEN') {
      if (segment.flags.syn && !segment.flags.ack) {
        this.rcvNxt = segment.seqNumber + 1;
        this.nextSeqNum = this.isn;
        this.sendBase = this.isn;

        const res = this.fsm.trigger('RECV_SYN', (cond) => cond === 'valid_checksum');
        const synAck = this.createSegment(
          segment.srcPort,
          { syn: true, ack: true, fin: false, rst: false },
          this.nextSeqNum,
          this.rcvNxt,
        );
        this.nextSeqNum += 1;

        this.emitStateChange(
          res.previousState,
          res.newState,
          'RECV_SYN',
          res.action!,
          `Recebeu SYN. Enviando SYN-ACK (SEQ=${synAck.seqNumber}, ACK=${synAck.ackNumber})`,
        );

        this.scheduleSYNAckTimer(segment.srcPort, synAck.seqNumber, synAck.ackNumber);
        this.transmit(synAck);
        return;
      }
    }

    // 4. Estado SYN_SENT
    if (currentState === 'SYN_SENT') {
      if (segment.flags.syn && segment.flags.ack) {
        if (this.synTimerId) {
          this.clock.cancel(this.synTimerId);
          this.synTimerId = undefined;
        }

        this.rcvNxt = segment.seqNumber + 1;
        this.sendBase = segment.ackNumber;

        const res = this.fsm.trigger('RECV_SYN_ACK', (cond) => cond === 'valid_checksum && valid_ack');
        const ack = this.createSegment(
          segment.srcPort,
          { syn: false, ack: true, fin: false, rst: false },
          this.nextSeqNum,
          this.rcvNxt,
        );

        this.emitStateChange(
          res.previousState,
          res.newState,
          'RECV_SYN_ACK',
          res.action!,
          `Recebeu SYN-ACK. Handshake concluído! Enviando ACK (SEQ=${ack.seqNumber}, ACK=${ack.ackNumber})`,
        );

        this.transmit(ack);
        return;
      }
    }

    // 5. Estado SYN_RCVD
    if (currentState === 'SYN_RCVD') {
      if (segment.flags.ack && !segment.flags.syn) {
        if (this.synAckTimerId) {
          this.clock.cancel(this.synAckTimerId);
          this.synAckTimerId = undefined;
        }

        this.sendBase = segment.ackNumber;
        const res = this.fsm.trigger('RECV_ACK', (cond) => cond === 'valid_checksum && valid_ack');
        this.emitStateChange(
          res.previousState,
          res.newState,
          'RECV_ACK',
          res.action!,
          'ACK final recebido. Conexão agora ESTABLISHED no servidor!',
        );
        return;
      }
    }

    // 6. Estado ESTABLISHED
    if (currentState === 'ESTABLISHED') {
      // Caso 6a: Recebimento de FIN (Início do encerramento passivo)
      if (segment.flags.fin) {
        this.rcvNxt = segment.seqNumber + 1;
        const res = this.fsm.trigger('RECV_FIN', (cond) => cond === 'valid_checksum');
        const ack = this.createSegment(
          segment.srcPort,
          { syn: false, ack: true, fin: false, rst: false },
          this.nextSeqNum,
          this.rcvNxt,
        );

        this.emitStateChange(
          res.previousState,
          res.newState,
          'RECV_FIN',
          res.action!,
          `Recebeu FIN. Enviando ACK (ACK=${ack.ackNumber}) e entrando em CLOSE_WAIT.`,
        );

        this.transmit(ack);
        return;
      }

      // Caso 6b: Recebimento de Dados
      if (segment.data && segment.data.length > 0) {
        if (segment.seqNumber === this.rcvNxt) {
          // Em ordem!
          const dataLen = segment.data.length;
          this.rcvNxt += dataLen;
          this.receivedData.push(segment.data);

          const ack = this.createSegment(
            segment.srcPort,
            { syn: false, ack: true, fin: false, rst: false },
            this.nextSeqNum,
            this.rcvNxt,
          );

          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: 'ESTABLISHED',
            event: 'RECV_DATA',
            condition: 'valid_checksum',
            action: 'PROCESS_DATA_AND_SEND_ACK',
            newState: 'ESTABLISHED',
            details: `[TCP Dados em Ordem] Recebeu SEQ=${segment.seqNumber} ("${segment.data}"). Enviando ACK=${this.rcvNxt}.`,
            type: 'APPLICATION_DELIVERY',
            packetId: segment.id,
          });

          this.transmit(ack);
        } else if (segment.seqNumber > this.rcvNxt) {
          // Fora de ordem (gap de perda de segmento)
          const dupAck = this.createSegment(
            segment.srcPort,
            { syn: false, ack: true, fin: false, rst: false },
            this.nextSeqNum,
            this.rcvNxt,
          );

          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: 'ESTABLISHED',
            event: 'RECV_DATA_OUT_OF_ORDER',
            action: 'SEND_DUPLICATE_ACK',
            newState: 'ESTABLISHED',
            details: `[TCP Fora de Ordem] Esperava SEQ=${this.rcvNxt}, mas recebeu SEQ=${segment.seqNumber}. Enviando ACK duplicado ACK=${this.rcvNxt}.`,
            type: 'PACKET_SENT',
            packetId: dupAck.id,
          });

          this.transmit(dupAck);
        }
        return;
      }

      // Caso 6c: Recebimento de ACK
      if (segment.flags.ack) {
        if (segment.ackNumber > this.sendBase) {
          // ACK cumulativo novo avançou a base!
          const sampleRTT = this.clock.getTime() - (this.unackedPackets[0]?.sentAt ?? this.clock.getTime());
          const isRetrans = this.unackedPackets[0]?.isRetransmission ?? false;

          // Remove pacotes confirmados
          this.unackedPackets = this.unackedPackets.filter(
            (p) => p.segment.seqNumber + Math.max(1, p.segment.data.length) > segment.ackNumber,
          );

          this.sendBase = segment.ackNumber;
          this.dupAckCount = 0;

          // Atualiza RTT usando o algoritmo de Karn (apenas para pacotes não retransmitidos)
          if (!isRetrans && sampleRTT > 0) {
            this.rttEstimator.updateSample(sampleRTT);
          }

          if (this.unackedPackets.length === 0) {
            if (this.dataRetransmitTimerId) {
              this.clock.cancel(this.dataRetransmitTimerId);
              this.dataRetransmitTimerId = undefined;
            }
          } else {
            this.startDataRetransmitTimer(segment.srcPort);
          }

          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: 'ESTABLISHED',
            event: 'RECV_ACK',
            condition: 'valid_checksum',
            action: 'PROCESS_ACK',
            newState: 'ESTABLISHED',
            details: `[TCP Novo ACK] ACK=${segment.ackNumber} recebido. Nova base de envio=${this.sendBase}.`,
            type: 'LOG_MESSAGE',
            packetId: segment.id,
          });
        } else if (segment.ackNumber === this.sendBase && this.unackedPackets.length > 0) {
          // ACK Duplicado!
          this.dupAckCount++;

          this.eventBus.emit({
            virtualTime: this.clock.getTime(),
            host: this.hostName,
            previousState: 'ESTABLISHED',
            event: 'DUP_ACK',
            action: 'INCREMENT_DUP_COUNT',
            newState: 'ESTABLISHED',
            details: `[TCP ACK Duplicado #${this.dupAckCount}] ACK=${segment.ackNumber} recebido novamente.`,
            type: 'LOG_MESSAGE',
            packetId: segment.id,
          });

          // CENÁRIO 6: 3 ACKs Duplicados -> FAST RETRANSMIT!
          if (this.dupAckCount === 3) {
            this.fastRetransmitCount++;
            const oldest = this.unackedPackets[0];
            oldest.isRetransmission = true;

            const fastRetransmitSeg = this.createSegment(
              segment.srcPort,
              oldest.segment.flags,
              oldest.segment.seqNumber,
              this.rcvNxt,
              oldest.segment.data,
              true,
            );

            this.eventBus.emit({
              virtualTime: this.clock.getTime(),
              host: this.hostName,
              previousState: 'ESTABLISHED',
              event: 'DUP_ACK_3',
              action: 'FAST_RETRANSMIT',
              newState: 'ESTABLISHED',
              details: `⚡ [FAST RETRANSMIT] 3 ACKs duplicados detectados! Retransmitindo imediatamente SEQ=${fastRetransmitSeg.seqNumber} sem esperar o timeout de ${this.rttEstimator.getTimeoutInterval()}ms!`,
              type: 'FAST_RETRANSMIT',
              packetId: fastRetransmitSeg.id,
            });

            this.transmit(fastRetransmitSeg);
          }
        }
        return;
      }
    }

    // 7. Estado FIN_WAIT_1
    if (currentState === 'FIN_WAIT_1') {
      const acksOurFin = segment.flags.ack && segment.ackNumber >= this.nextSeqNum;

      if (segment.flags.fin && acksOurFin) {
        // Recebeu FIN que também confirma nosso FIN simultaneamente
        if (this.finTimerId) this.clock.cancel(this.finTimerId);
        this.rcvNxt = segment.seqNumber + 1;
        const res = this.fsm.trigger('RECV_FIN_ACK', (cond) => cond === 'valid_checksum');
        const ack = this.createSegment(segment.srcPort, { syn: false, ack: true, fin: false, rst: false }, this.nextSeqNum, this.rcvNxt);
        this.emitStateChange(res.previousState, res.newState, 'RECV_FIN_ACK', res.action!, 'Recebeu FIN+ACK confirmando nosso FIN. Entrando em TIME_WAIT.');
        this.startTimeWaitTimer();
        this.transmit(ack);
        return;
      }

      if (segment.flags.fin && !acksOurFin) {
        // Fechamento simultâneo (Cenário 5): o peer enviou FIN sem ter visto nosso FIN
        if (this.finTimerId) this.clock.cancel(this.finTimerId);
        this.rcvNxt = segment.seqNumber + 1;
        const res = this.fsm.trigger('RECV_FIN', (cond) => cond === 'valid_checksum');
        const ack = this.createSegment(segment.srcPort, { syn: false, ack: true, fin: false, rst: false }, this.nextSeqNum, this.rcvNxt);
        this.emitStateChange(res.previousState, res.newState, 'RECV_FIN', res.action!, 'Fechamento Simultâneo! Recebeu FIN antes de confirmação. Entrando em CLOSING.');
        this.transmit(ack);
        return;
      }

      if (acksOurFin) {
        // Encerramento normal: recebeu ACK do FIN
        if (this.finTimerId) this.clock.cancel(this.finTimerId);
        const res = this.fsm.trigger('RECV_ACK', (cond) => cond === 'valid_checksum && valid_ack');
        this.emitStateChange(res.previousState, res.newState, 'RECV_ACK', res.action!, 'ACK do FIN recebido. Entrando em FIN_WAIT_2.');
        return;
      }
    }

    // 8. Estado FIN_WAIT_2
    if (currentState === 'FIN_WAIT_2') {
      if (segment.flags.fin) {
        this.rcvNxt = segment.seqNumber + 1;
        const res = this.fsm.trigger('RECV_FIN', (cond) => cond === 'valid_checksum');
        const ack = this.createSegment(segment.srcPort, { syn: false, ack: true, fin: false, rst: false }, this.nextSeqNum, this.rcvNxt);
        this.emitStateChange(res.previousState, res.newState, 'RECV_FIN', res.action!, 'Recebeu FIN remoto. Enviando ACK e iniciando timer de TIME_WAIT (2*MSL).');
        this.startTimeWaitTimer();
        this.transmit(ack);
        return;
      }
    }

    // 9. Estado CLOSING (Cenário 5)
    if (currentState === 'CLOSING') {
      if (segment.flags.ack && segment.ackNumber >= this.nextSeqNum) {
        const res = this.fsm.trigger('RECV_ACK', (cond) => cond === 'valid_checksum && valid_ack');
        this.emitStateChange(res.previousState, res.newState, 'RECV_ACK', res.action!, 'ACK do FIN recebido no CLOSING. Entrando em TIME_WAIT.');
        this.startTimeWaitTimer();
        return;
      }
    }

    // 10. Estado LAST_ACK
    if (currentState === 'LAST_ACK') {
      if (segment.flags.ack) {
        if (this.finTimerId) this.clock.cancel(this.finTimerId);
        const res = this.fsm.trigger('RECV_ACK', (cond) => cond === 'valid_checksum && valid_ack');
        this.emitStateChange(res.previousState, res.newState, 'RECV_ACK', res.action!, 'ACK do FIN recebido no LAST_ACK. Conexão agora CLOSED.');
        return;
      }
    }

    // 11. Estado TIME_WAIT
    if (currentState === 'TIME_WAIT') {
      if (segment.flags.fin) {
        // Reenvia ACK se receber FIN duplicado
        const ack = this.createSegment(segment.srcPort, { syn: false, ack: true, fin: false, rst: false }, this.nextSeqNum, this.rcvNxt);
        this.startTimeWaitTimer();
        this.transmit(ack);
        return;
      }
    }
  }
}
