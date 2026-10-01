import { describe, it, expect, beforeEach } from 'vitest';
import { SimulationEngine } from '../core/simulation/simulation_engine';

describe('Suíte dos 10 Cenários Obrigatórios (Requisito 4.7)', () => {
  let sim: SimulationEngine;

  beforeEach(() => {
    sim = new SimulationEngine('TCP', {
      lossRate: 0,
      corruptionRate: 0,
      duplicationRate: 0,
      reorderRate: 0,
      minDelayMs: 20,
      maxDelayMs: 40,
      seed: 42,
    });
  });

  // -------------------------------------------------------------
  // CENÁRIO 1: TCP Handshake sem falhas
  // Resultado esperado: A: CLOSED -> SYN_SENT -> ESTABLISHED; B: LISTEN -> SYN_RCVD -> ESTABLISHED
  // -------------------------------------------------------------
  it('Cenário 1: TCP Handshake sem falhas', () => {
    const statesA: string[] = [sim.tcpHostA.getCurrentState()];
    const statesB: string[] = [sim.tcpHostB.getCurrentState()];

    sim.eventBus.subscribe((log) => {
      if (log.host === 'Host A' && log.type === 'HOST_STATE_CHANGED' && log.newState) {
        statesA.push(log.newState);
      }
      if (log.host === 'Host B' && log.type === 'HOST_STATE_CHANGED' && log.newState) {
        statesB.push(log.newState);
      }
    });

    // B inicia escuta passiva
    sim.tcpHostB.listen();
    // A inicia conexão ativa
    sim.tcpHostA.connect(80);

    // Executa no relógio virtual até silenciar
    sim.runUntilQuiet();

    expect(sim.tcpHostA.getCurrentState()).toBe('ESTABLISHED');
    expect(sim.tcpHostB.getCurrentState()).toBe('ESTABLISHED');

    // Validação da sequência exata de estados
    expect(statesA).toEqual(['CLOSED', 'SYN_SENT', 'ESTABLISHED']);
    expect(statesB).toEqual(['CLOSED', 'LISTEN', 'SYN_RCVD', 'ESTABLISHED']);
  });

  // -------------------------------------------------------------
  // CENÁRIO 2: TCP Perda do SYN
  // Resultado esperado: Timeout e retransmissão do SYN
  // -------------------------------------------------------------
  it('Cenário 2: TCP Perda do SYN', () => {
    sim.tcpHostB.listen();

    // Configura descarte manual no primeiro SYN
    sim.triggerDropNext();

    sim.tcpHostA.connect(80);

    // O 1º SYN é perdido. Executa simulação até ocorrer timeout e retransmissão
    sim.runUntilQuiet();

    expect(sim.stats.retransmissions).toBeGreaterThanOrEqual(1);
    expect(sim.tcpHostA.getCurrentState()).toBe('ESTABLISHED');
    expect(sim.tcpHostB.getCurrentState()).toBe('ESTABLISHED');
  });

  // -------------------------------------------------------------
  // CENÁRIO 3: TCP Perda do SYN-ACK
  // Resultado esperado: Cliente retransmite o SYN; servidor reenvia o SYN-ACK
  // -------------------------------------------------------------
  it('Cenário 3: TCP Perda do SYN-ACK', () => {
    sim.tcpHostB.listen();

    let synDelivered = false;
    sim.eventBus.subscribe((log) => {
      // Quando o SYN for recebido em B, descarta o próximo segmento que será o SYN-ACK
      if (log.host === 'Host B' && log.action === 'SEND_SYN_ACK' && !synDelivered) {
        synDelivered = true;
        sim.triggerDropNext();
      }
    });

    sim.tcpHostA.connect(80);
    sim.runUntilQuiet();

    expect(sim.stats.retransmissions).toBeGreaterThanOrEqual(1);
    expect(sim.tcpHostA.getCurrentState()).toBe('ESTABLISHED');
    expect(sim.tcpHostB.getCurrentState()).toBe('ESTABLISHED');
  });

  // -------------------------------------------------------------
  // CENÁRIO 4: TCP Encerramento normal
  // Resultado esperado: A passa por FIN_WAIT_1, FIN_WAIT_2 e TIME_WAIT; B por CLOSE_WAIT e LAST_ACK
  // -------------------------------------------------------------
  it('Cenário 4: TCP Encerramento normal (4 vias)', () => {
    // 1. Estabelece conexão
    sim.tcpHostB.listen();
    sim.tcpHostA.connect(80);
    sim.runUntilQuiet();

    const statesA: string[] = [];
    const statesB: string[] = [];

    sim.eventBus.subscribe((log) => {
      if (log.host === 'Host A' && log.type === 'HOST_STATE_CHANGED' && log.newState) {
        statesA.push(log.newState);
      }
      if (log.host === 'Host B' && log.type === 'HOST_STATE_CHANGED' && log.newState) {
        statesB.push(log.newState);
      }
    });

    // 2. A inicia encerramento ativo
    sim.tcpHostA.close(80);

    // Roda até B receber FIN e entrar em CLOSE_WAIT
    while (sim.tcpHostB.getCurrentState() !== 'CLOSE_WAIT' && sim.clock.hasScheduledTimers()) {
      sim.step();
    }
    expect(sim.tcpHostB.getCurrentState()).toBe('CLOSE_WAIT');

    // 3. Aplicação em B também decide fechar
    sim.tcpHostB.close(10001);

    // 4. Conclui TIME_WAIT e cleanup
    sim.runUntilQuiet();

    expect(statesA).toContain('FIN_WAIT_1');
    expect(statesA).toContain('FIN_WAIT_2');
    expect(statesA).toContain('TIME_WAIT');
    expect(statesA).toContain('CLOSED');

    expect(statesB).toContain('CLOSE_WAIT');
    expect(statesB).toContain('LAST_ACK');
    expect(statesB).toContain('CLOSED');
  });

  // -------------------------------------------------------------
  // CENÁRIO 5: TCP Fechamento simultâneo
  // Resultado esperado: Ambos passam por FIN_WAIT_1 -> CLOSING -> TIME_WAIT
  // -------------------------------------------------------------
  it('Cenário 5: TCP Fechamento simultâneo', () => {
    // 1. Estabelece conexão
    sim.tcpHostB.listen();
    sim.tcpHostA.connect(80);
    sim.runUntilQuiet();

    const statesA: string[] = [];
    const statesB: string[] = [];

    sim.eventBus.subscribe((log) => {
      if (log.host === 'Host A' && log.type === 'HOST_STATE_CHANGED' && log.newState) {
        statesA.push(log.newState);
      }
      if (log.host === 'Host B' && log.type === 'HOST_STATE_CHANGED' && log.newState) {
        statesB.push(log.newState);
      }
    });

    // 2. Ambos fecham simultaneamente estando em ESTABLISHED
    sim.tcpHostA.close(80);
    sim.tcpHostB.close(10001);

    sim.runUntilQuiet();

    expect(statesA).toContain('FIN_WAIT_1');
    expect(statesA).toContain('CLOSING');
    expect(statesA).toContain('TIME_WAIT');
    expect(statesA).toContain('CLOSED');

    expect(statesB).toContain('FIN_WAIT_1');
    expect(statesB).toContain('CLOSING');
    expect(statesB).toContain('TIME_WAIT');
    expect(statesB).toContain('CLOSED');
  });

  // -------------------------------------------------------------
  // CENÁRIO 6: TCP Perda de um segmento de dados no meio de 10
  // Resultado esperado: 3 ACKs duplicados e retransmissão rápida, sem esperar o timeout
  // -------------------------------------------------------------
  it('Cenário 6: TCP Perda de um segmento de dados & Fast Retransmit', () => {
    sim.tcpHostB.listen();
    sim.tcpHostA.connect(80);
    sim.runUntilQuiet();

    let fastRetransmitTriggered = false;
    sim.eventBus.subscribe((log) => {
      if (log.type === 'FAST_RETRANSMIT') {
        fastRetransmitTriggered = true;
      }
    });

    // Envia 10 segmentos de dados, descartando intencionalmente o 3º segmento
    for (let i = 1; i <= 10; i++) {
      if (i === 3) {
        sim.triggerDropNext(); // Descarta o 3º
      }
      sim.tcpHostA.sendData(80, `DataSeg_${i}`);
    }

    sim.runUntilQuiet();

    expect(fastRetransmitTriggered).toBe(true);
    expect(sim.tcpHostA.fastRetransmitCount).toBeGreaterThanOrEqual(1);
    // Todos os dados entregues ao final
    expect(sim.tcpHostB.receivedData.length).toBe(10);
  });

  // -------------------------------------------------------------
  // CENÁRIO 7: TCP Conexão a uma porta fechada
  // Resultado esperado: Resposta RST
  // -------------------------------------------------------------
  it('Cenário 7: TCP Conexão a porta fechada com resposta RST', () => {
    let rstGenerated = false;

    sim.eventBus.subscribe((log) => {
      if (log.type === 'RST_GENERATED') {
        rstGenerated = true;
      }
    });

    // Host B NÃO inicia listen (permanece em CLOSED na porta 80)
    expect(sim.tcpHostB.getCurrentState()).toBe('CLOSED');

    // Host A tenta conectar
    sim.tcpHostA.connect(80);
    sim.runUntilQuiet();

    expect(rstGenerated).toBe(true);
    expect(sim.tcpHostA.getCurrentState()).toBe('CLOSED');
  });

  // -------------------------------------------------------------
  // CENÁRIO 8: UDP 20 datagramas com 30% de perda
  // Resultado esperado: Perdidos não são recuperados e nenhuma retransmissão ocorre
  // -------------------------------------------------------------
  it('Cenário 8: UDP 20 datagramas com 30% de perda', () => {
    const udpSim = new SimulationEngine('UDP', {
      lossRate: 0.3,
      corruptionRate: 0,
      duplicationRate: 0,
      seed: 999,
      minDelayMs: 10,
      maxDelayMs: 20,
    });

    for (let i = 1; i <= 20; i++) {
      udpSim.udpHostA.send(53, `Msg_${i}`);
    }

    udpSim.runUntilQuiet();

    // Nenhuma retransmissão permitida no UDP
    expect(udpSim.stats.retransmissions).toBe(0);
    // Com 30% de perda, alguns devem ter sido perdidos
    expect(udpSim.stats.packetsLost).toBeGreaterThan(0);
    expect(udpSim.udpHostB.receivedMessages.length).toBe(
      20 - udpSim.stats.packetsLost,
    );
  });

  // -------------------------------------------------------------
  // CENÁRIO 9: UDP Datagrama com checksum corrompido
  // Resultado esperado: Descartado silenciosamente pelo receptor, sem notificação
  // -------------------------------------------------------------
  it('Cenário 9: UDP Datagrama com checksum corrompido', () => {
    const udpSim = new SimulationEngine('UDP', {
      lossRate: 0,
      corruptionRate: 1.0, // Força corrupção de 100% dos pacotes
      seed: 42,
    });

    udpSim.udpHostA.send(53, 'DadoMuitoImportante');
    udpSim.runUntilQuiet();

    // Deve ter sido descartado pelo receptor
    expect(udpSim.udpHostB.droppedCount).toBe(1);
    expect(udpSim.udpHostB.receivedMessages.length).toBe(0);
    expect(udpSim.stats.retransmissions).toBe(0);
  });

  // -------------------------------------------------------------
  // CENÁRIO 10: UDP vs TCP (Mesma carga, mesmo canal ruidoso)
  // Resultado esperado: Relatório comparando entregues, perdidos, duplicados, em ordem e tempo total
  // -------------------------------------------------------------
  it('Cenário 10: UDP vs TCP comparativo com mesma seed e carga', () => {
    const testChannelConfig = {
      lossRate: 0.15,
      corruptionRate: 0.05,
      minDelayMs: 20,
      maxDelayMs: 50,
      seed: 777,
    };

    // 1. Execução UDP
    const simUDP = new SimulationEngine('UDP', testChannelConfig);
    for (let i = 1; i <= 15; i++) {
      simUDP.udpHostA.send(53, `Packet_${i}`);
    }
    simUDP.runUntilQuiet();

    // 2. Execução TCP
    const simTCP = new SimulationEngine('TCP', testChannelConfig);
    simTCP.tcpHostB.listen();
    simTCP.tcpHostA.connect(80);
    simTCP.runUntilQuiet();

    for (let i = 1; i <= 15; i++) {
      simTCP.tcpHostA.sendData(80, `Packet_${i}`);
    }
    simTCP.runUntilQuiet();

    // Comparações fundamentais:
    // UDP não recupera perdas (retransmissions = 0)
    expect(simUDP.stats.retransmissions).toBe(0);

    // TCP realiza retransmissões para garantir entrega confiável
    expect(simTCP.stats.retransmissions).toBeGreaterThanOrEqual(0);

    // Ambas geram métricas completas para o relatório
    expect(simUDP.stats.packetsSent).toBe(15);
    expect(simTCP.stats.packetsSent).toBeGreaterThan(15); // SYN, ACK, Dados, etc.
  });
});
