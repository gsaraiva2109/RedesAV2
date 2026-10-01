import { useState, useEffect, useRef, useCallback } from 'react';
import { SimulationEngine } from '../../core/simulation/simulation_engine';
import { ChannelConfig, ProtocolType, SequenceDiagramItem, SimLogEntry, SimStats } from '../../core/types';

export function useSimulation(initialProtocol: ProtocolType = 'TCP') {
  const [protocol, setProtocol] = useState<ProtocolType>(initialProtocol);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [virtualTime, setVirtualTime] = useState<number>(0);
  const [stateA, setStateA] = useState<string>('CLOSED');
  const [stateB, setStateB] = useState<string>('CLOSED');
  const [lastTransitionA, setLastTransitionA] = useState<string>('');
  const [lastTransitionB, setLastTransitionB] = useState<string>('');
  const [logs, setLogs] = useState<SimLogEntry[]>([]);
  const [sequenceItems, setSequenceItems] = useState<SequenceDiagramItem[]>([]);
  const [stats, setStats] = useState<SimStats>({
    packetsSent: 0,
    packetsDelivered: 0,
    packetsLost: 0,
    packetsCorrupted: 0,
    packetsDuplicated: 0,
    retransmissions: 0,
    deliveredInOrder: 0,
    totalVirtualTime: 0,
  });
  const [channelConfig, setChannelConfig] = useState<ChannelConfig>({
    lossRate: 0,
    minDelayMs: 25,
    maxDelayMs: 50,
    corruptionRate: 0,
    duplicationRate: 0,
    reorderRate: 0,
    dropNextSegment: false,
    seed: 42,
  });

  const simRef = useRef<SimulationEngine>(new SimulationEngine(initialProtocol, channelConfig));
  const timerRef = useRef<number | null>(null);

  const syncStateFromEngine = useCallback(() => {
    const sim = simRef.current;
    setVirtualTime(sim.clock.getTime());
    setSequenceItems([...sim.sequenceItems]);
    setStats({ ...sim.stats, totalVirtualTime: sim.clock.getTime() });

    if (sim.protocol === 'TCP') {
      setStateA(sim.tcpHostA.getCurrentState());
      setStateB(sim.tcpHostB.getCurrentState());
    } else {
      setStateA(sim.udpHostA.getCurrentState());
      setStateB(sim.udpHostB.getCurrentState());
    }
  }, []);

  // Inicializa barramento de eventos
  useEffect(() => {
    const sim = simRef.current;
    const unsubscribe = sim.eventBus.subscribe((log) => {
      setLogs((prev) => [log, ...prev].slice(0, 500)); // Mantém últimos 500 logs

      if (log.host === 'Host A' && log.event) {
        setLastTransitionA(`${log.event} / ${log.action}`);
      } else if (log.host === 'Host B' && log.event) {
        setLastTransitionB(`${log.event} / ${log.action}`);
      }

      syncStateFromEngine();
    });

    return () => {
      unsubscribe();
    };
  }, [syncStateFromEngine]);

  // Loop de execução animada (Play)
  useEffect(() => {
    if (isPlaying) {
      const intervalMs = Math.max(20, Math.floor(100 / speedMultiplier));
      timerRef.current = window.setInterval(() => {
        const sim = simRef.current;
        if (sim.clock.hasScheduledTimers()) {
          sim.step();
          syncStateFromEngine();
        } else {
          setIsPlaying(false);
        }
      }, intervalMs);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speedMultiplier, syncStateFromEngine]);

  const togglePlay = () => setIsPlaying((prev) => !prev);

  const stepForward = () => {
    setIsPlaying(false);
    simRef.current.step();
    syncStateFromEngine();
  };

  const resetSimulation = (newSeed?: number) => {
    setIsPlaying(false);
    const sim = simRef.current;
    sim.reset(newSeed);
    setLogs([]);
    setLastTransitionA('');
    setLastTransitionB('');
    syncStateFromEngine();
  };

  const changeProtocol = (newProto: ProtocolType) => {
    setIsPlaying(false);
    setProtocol(newProto);
    const sim = simRef.current;
    sim.setProtocol(newProto);
    setLogs([]);
    setLastTransitionA('');
    setLastTransitionB('');
    syncStateFromEngine();
  };

  const updateConfig = (newCfg: Partial<ChannelConfig>) => {
    setChannelConfig((prev) => {
      const updated = { ...prev, ...newCfg };
      simRef.current.channel.updateConfig(updated);
      return updated;
    });
  };

  const triggerManualDrop = () => {
    simRef.current.triggerDropNext();
    setChannelConfig((prev) => ({ ...prev, dropNextSegment: true }));
  };

  return {
    engine: simRef.current,
    protocol,
    isPlaying,
    speedMultiplier,
    setSpeedMultiplier,
    virtualTime,
    stateA,
    stateB,
    lastTransitionA,
    lastTransitionB,
    logs,
    sequenceItems,
    stats,
    channelConfig,
    togglePlay,
    stepForward,
    resetSimulation,
    changeProtocol,
    updateConfig,
    triggerManualDrop,
    syncStateFromEngine,
  };
}
