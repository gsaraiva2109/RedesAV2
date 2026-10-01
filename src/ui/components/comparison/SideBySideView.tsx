import React, { useState } from 'react';
import { SimulationEngine } from '../../../core/simulation/simulation_engine';
import { Play, RotateCcw, BarChart2 } from 'lucide-react';

export const SideBySideView: React.FC = () => {
  const [lossRate, setLossRate] = useState(0.2);
  const [corruptionRate, setCorruptionRate] = useState(0.05);
  const [numPackets, setNumPackets] = useState(15);
  const [seed, setSeed] = useState(777);

  const [results, setResults] = useState<{
    ran: boolean;
    udp: {
      sent: number;
      delivered: number;
      lost: number;
      corrupted: number;
      retransmissions: number;
      time: number;
    };
    tcp: {
      sent: number;
      delivered: number;
      lost: number;
      corrupted: number;
      retransmissions: number;
      time: number;
    };
  } | null>(null);

  const runComparison = () => {
    const config = {
      lossRate,
      corruptionRate,
      minDelayMs: 20,
      maxDelayMs: 40,
      seed,
    };

    // 1. Executa UDP
    const simUDP = new SimulationEngine('UDP', config);
    for (let i = 1; i <= numPackets; i++) {
      simUDP.udpHostA.send(53, `Msg_${i}`);
    }
    simUDP.runUntilQuiet();

    // 2. Executa TCP
    const simTCP = new SimulationEngine('TCP', config);
    simTCP.tcpHostB.listen();
    simTCP.tcpHostA.connect(80);
    simTCP.runUntilQuiet();

    for (let i = 1; i <= numPackets; i++) {
      simTCP.tcpHostA.sendData(80, `Msg_${i}`);
    }
    simTCP.runUntilQuiet();

    setResults({
      ran: true,
      udp: {
        sent: simUDP.stats.packetsSent,
        delivered: simUDP.udpHostB.receivedMessages.length,
        lost: simUDP.stats.packetsLost,
        corrupted: simUDP.stats.packetsCorrupted,
        retransmissions: simUDP.stats.retransmissions,
        time: simUDP.clock.getTime(),
      },
      tcp: {
        sent: simTCP.stats.packetsSent,
        delivered: simTCP.tcpHostB.receivedData.length,
        lost: simTCP.stats.packetsLost,
        corrupted: simTCP.stats.packetsCorrupted,
        retransmissions: simTCP.stats.retransmissions,
        time: simTCP.clock.getTime(),
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Controles do Teste Comparativo */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="text-sm font-bold text-slate-200">
              Cenário 10: Comparação Lado a Lado (UDP vs TCP)
            </h3>
            <p className="text-xs text-slate-400">
              Executa ambos os protocolos sob a mesma carga e condições ruidosas idênticas.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div>
            <span className="text-slate-400 block mb-1">Carga (Nº Datagramas):</span>
            <input
              type="number"
              min="5"
              max="50"
              value={numPackets}
              onChange={(e) => setNumPackets(parseInt(e.target.value) || 10)}
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 w-20"
            />
          </div>

          <div>
            <span className="text-slate-400 block mb-1">Perda do Canal:</span>
            <input
              type="number"
              min="0"
              max="0.8"
              step="0.05"
              value={lossRate}
              onChange={(e) => setLossRate(parseFloat(e.target.value) || 0)}
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 w-20"
            />
          </div>

          <div>
            <span className="text-slate-400 block mb-1">Seed Determinística:</span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
              className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200 w-20"
            />
          </div>

          <button
            onClick={runComparison}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold transition shadow"
          >
            <Play className="w-4 h-4" />
            Executar Comparação
          </button>
        </div>
      </div>

      {/* Resultados da Comparação Lado a Lado */}
      {results && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Cartão UDP */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-lg font-bold text-indigo-400">Protocolo UDP (RFC 768)</h4>
              <span className="text-xs bg-indigo-950 border border-indigo-800 text-indigo-300 px-2 py-0.5 rounded font-mono">
                Sem Conexão
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Pacotes Enviados</span>
                <span className="text-xl font-bold font-mono text-slate-200">{results.udp.sent}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Entregues com Sucesso</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {results.udp.delivered} / {numPackets}
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Perdidos / Descartados</span>
                <span className="text-xl font-bold font-mono text-rose-400">{results.udp.lost}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Retransmissões</span>
                <span className="text-xl font-bold font-mono text-amber-400">
                  {results.udp.retransmissions} (Nenhuma!)
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 col-span-2">
                <span className="text-xs text-slate-400 block">Tempo Virtual Total</span>
                <span className="text-xl font-bold font-mono text-cyan-400">{results.udp.time} ms</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 italic">
              Conclusão UDP: Entrega ultra-rápida sem sobrecarga de handshakes ou timers, porém com perda definitiva de {results.udp.lost} datagramas.
            </p>
          </div>

          {/* Cartão TCP */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="text-lg font-bold text-emerald-400">Protocolo TCP (RFC 793)</h4>
              <span className="text-xs bg-emerald-950 border border-emerald-800 text-emerald-300 px-2 py-0.5 rounded font-mono">
                Confiável / Orientado a Conexão
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Segmentos Transmitidos</span>
                <span className="text-xl font-bold font-mono text-slate-200">
                  {results.tcp.sent} (inclui SYN, ACK)
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Entregues com Sucesso</span>
                <span className="text-xl font-bold font-mono text-emerald-400">
                  {results.tcp.delivered} / {numPackets} (100%!)
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Perdas Recuperadas</span>
                <span className="text-xl font-bold font-mono text-amber-400">{results.tcp.lost}</span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Retransmissões Realizadas</span>
                <span className="text-xl font-bold font-mono text-amber-300">
                  {results.tcp.retransmissions}
                </span>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 col-span-2">
                <span className="text-xs text-slate-400 block">Tempo Virtual Total</span>
                <span className="text-xl font-bold font-mono text-cyan-400">{results.tcp.time} ms</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 italic">
              Conclusão TCP: Garantiu 100% de entrega ordenada através de retransmissões ({results.tcp.retransmissions} retransmitidos), ao custo de maior tempo virtual decorrido ({results.tcp.time}ms).
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
