/**
 * Implementação do cálculo de Checksum da Internet (RFC 1071 / Kurose & Ross Seção 3.3)
 * Algoritmo: Soma em complemento de 1 de inteiros de 16 bits com adição de carry bits
 * e inversão bit a bit final.
 */

export function calculate16BitChecksum(data: Uint8Array): number {
  let sum = 0;
  const len = data.length;

  for (let i = 0; i < len; i += 2) {
    let word = data[i] << 8;
    if (i + 1 < len) {
      word |= data[i + 1];
    }
    sum += word;
    // Adiciona carry bit ao valor de 16 bits
    if (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >> 16);
    }
  }

  // Dobra quaisquer carry bits restantes
  while (sum >> 16) {
    sum = (sum & 0xffff) + (sum >> 16);
  }

  // Complemento de 1 (inversão dos bits)
  return ~sum & 0xffff;
}

export function verify16BitChecksum(dataWithChecksum: Uint8Array): boolean {
  let sum = 0;
  const len = dataWithChecksum.length;

  for (let i = 0; i < len; i += 2) {
    let word = dataWithChecksum[i] << 8;
    if (i + 1 < len) {
      word |= dataWithChecksum[i + 1];
    }
    sum += word;
    if (sum > 0xffff) {
      sum = (sum & 0xffff) + (sum >> 16);
    }
  }

  while (sum >> 16) {
    sum = (sum & 0xffff) + (sum >> 16);
  }

  // Se a soma incluindo o checksum original resultar em 0xffff, o checksum é válido
  return (sum & 0xffff) === 0xffff;
}

/**
 * Serializa os campos de um datagrama UDP em bytes para o cálculo real de checksum:
 * [srcPort (2B), dstPort (2B), length (2B), checksum (2B), data (...)]
 */
export function serializeUDPForChecksum(
  srcPort: number,
  dstPort: number,
  length: number,
  checksum: number,
  data: string,
): Uint8Array {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(data);
  const totalLength = 8 + payloadBytes.length;
  const buffer = new Uint8Array(totalLength);

  buffer[0] = (srcPort >> 8) & 0xff;
  buffer[1] = srcPort & 0xff;
  buffer[2] = (dstPort >> 8) & 0xff;
  buffer[3] = dstPort & 0xff;
  buffer[4] = (length >> 8) & 0xff;
  buffer[5] = length & 0xff;
  buffer[6] = (checksum >> 8) & 0xff;
  buffer[7] = checksum & 0xff;

  buffer.set(payloadBytes, 8);
  return buffer;
}

/**
 * Calcula o checksum do UDP colocando 0 no campo de checksum
 */
export function computeUDPChecksum(
  srcPort: number,
  dstPort: number,
  data: string,
): number {
  const length = 8 + new TextEncoder().encode(data).length;
  const buffer = serializeUDPForChecksum(srcPort, dstPort, length, 0, data);
  return calculate16BitChecksum(buffer);
}

/**
 * Serializa campos de segmento TCP para cálculo do checksum
 */
export function serializeTCPForChecksum(
  srcPort: number,
  dstPort: number,
  seq: number,
  ack: number,
  flagsByte: number,
  window: number,
  checksum: number,
  data: string,
): Uint8Array {
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(data);
  const headerLen = 20;
  const buffer = new Uint8Array(headerLen + payloadBytes.length);

  buffer[0] = (srcPort >> 8) & 0xff;
  buffer[1] = srcPort & 0xff;
  buffer[2] = (dstPort >> 8) & 0xff;
  buffer[3] = dstPort & 0xff;

  buffer[4] = (seq >> 24) & 0xff;
  buffer[5] = (seq >> 16) & 0xff;
  buffer[6] = (seq >> 8) & 0xff;
  buffer[7] = seq & 0xff;

  buffer[8] = (ack >> 24) & 0xff;
  buffer[9] = (ack >> 16) & 0xff;
  buffer[10] = (ack >> 8) & 0xff;
  buffer[11] = ack & 0xff;

  buffer[12] = (5 << 4); // Data offset (5 words = 20 bytes)
  buffer[13] = flagsByte; // Flags
  buffer[14] = (window >> 8) & 0xff;
  buffer[15] = window & 0xff;

  buffer[16] = (checksum >> 8) & 0xff;
  buffer[17] = checksum & 0xff;
  buffer[18] = 0; // Urgent pointer
  buffer[19] = 0;

  buffer.set(payloadBytes, headerLen);
  return buffer;
}

export function computeTCPChecksum(
  srcPort: number,
  dstPort: number,
  seq: number,
  ack: number,
  flags: { syn: boolean; ack: boolean; fin: boolean; rst: boolean },
  window: number,
  data: string,
): number {
  let flagsByte = 0;
  if (flags.fin) flagsByte |= 0x01;
  if (flags.syn) flagsByte |= 0x02;
  if (flags.rst) flagsByte |= 0x04;
  if (flags.ack) flagsByte |= 0x10;

  const buffer = serializeTCPForChecksum(srcPort, dstPort, seq, ack, flagsByte, window, 0, data);
  return calculate16BitChecksum(buffer);
}
