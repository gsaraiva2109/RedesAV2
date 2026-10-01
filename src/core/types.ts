export type ProtocolType = 'TCP' | 'UDP';

export interface TCPFlags {
  syn: boolean;
  ack: boolean;
  fin: boolean;
  rst: boolean;
}

export interface TCPSegment {
  protocol: 'TCP';
  id: string;
  srcPort: number;
  dstPort: number;
  seqNumber: number;
  ackNumber: number;
  flags: TCPFlags;
  windowSize: number;
  checksum: number;
  data: string;
  isRetransmission?: boolean;
  sentAtVirtualTime: number;
}

export interface UDPDatagram {
  protocol: 'UDP';
  id: string;
  srcPort: number;
  dstPort: number;
  length: number;
  checksum: number;
  data: string;
  sentAtVirtualTime: number;
}

export type NetworkPacket = TCPSegment | UDPDatagram;

export interface ChannelConfig {
  lossRate: number; // 0 a 1 (ex: 0.3 para 30%)
  minDelayMs: number;
  maxDelayMs: number;
  corruptionRate: number; // 0 a 1
  duplicationRate: number; // 0 a 1
  reorderRate: number; // 0 a 1
  dropNextSegment: boolean; // descarte manual do próximo segmento
  seed: number;
}

export interface FSMState {
  id: string;
  label: string;
  description: string;
}

export interface FSMTransition {
  from: string;
  event: string;
  condition: string | null;
  action: string;
  to: string;
  description: string;
}

export interface FSMDefinition {
  name: string;
  description: string;
  initialState: string;
  states: FSMState[];
  transitions: FSMTransition[];
}

export type SimEventType =
  | 'HOST_STATE_CHANGED'
  | 'PACKET_SENT'
  | 'PACKET_RECEIVED'
  | 'PACKET_LOST'
  | 'PACKET_CORRUPTED'
  | 'PACKET_DUPLICATED'
  | 'TIMER_STARTED'
  | 'TIMER_FIRED'
  | 'TIMER_CANCELLED'
  | 'APPLICATION_DELIVERY'
  | 'FAST_RETRANSMIT'
  | 'RST_GENERATED'
  | 'LOG_MESSAGE';

export interface SimLogEntry {
  id: string;
  virtualTime: number;
  host: 'Host A' | 'Host B' | 'Channel' | 'System';
  previousState?: string;
  event: string;
  condition?: string;
  action: string;
  newState?: string;
  details: string;
  type: SimEventType;
  packetId?: string;
}

export interface SequenceDiagramItem {
  id: string;
  packet: NetworkPacket;
  fromHost: 'A' | 'B';
  toHost: 'A' | 'B';
  startTime: number;
  endTime: number;
  status: 'in_flight' | 'delivered' | 'lost' | 'corrupted';
  isRetransmission: boolean;
  label: string;
}

export interface SimStats {
  packetsSent: number;
  packetsDelivered: number;
  packetsLost: number;
  packetsCorrupted: number;
  packetsDuplicated: number;
  retransmissions: number;
  deliveredInOrder: number;
  totalVirtualTime: number;
}
