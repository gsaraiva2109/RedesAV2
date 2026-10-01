import React, { useState } from 'react';
import { useSimulation } from './hooks/useSimulation';
import { PlaybackBar } from './components/controls/PlaybackBar';
import { HostActionButtons } from './components/controls/HostActionButtons';
import { ChannelPanel } from './components/controls/ChannelPanel';
import { LadderDiagram } from './components/sequence/LadderDiagram';
import { StateGraphView } from './components/fsm/StateGraphView';
import { EventLogTable } from './components/logs/EventLogTable';
import { SideBySideView } from './components/comparison/SideBySideView';
import { Network, Split, CheckCircle2 } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'comparison'>('simulator');
  const [scenarioNotice, setScenarioNotice] = useState<string | null>(null);

  const {
    engine,
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
    channelConfig,
    togglePlay,
    stepForward,
    resetSimulation,
    changeProtocol,
    updateConfig,
    triggerManualDrop,
    syncStateFromEngine,
  } = useSimulation('TCP');

  // Carrega e executa cenários oficiais da especificação com 1 clique
  const loadScenario = (scenarioNum: number) => {
    resetSimulation(42);

    switch (scenarioNum) {
      case 1: // TCP Handshake sem falhas
        changeProtocol('TCP');
        updateConfig({ lossRate: 0, corruptionRate: 0, minDelayMs: 30, maxDelayMs: 50 });
        engine.tcpHostB.listen();
        engine.tcpHostA.connect(80);
        syncStateFromEngine();
        setScenarioNotice('Cenário 1 carregado: TCP Handshake de 3 vias sem falhas.');
        break;

      case 2: // TCP Perda do SYN
        changeProtocol('TCP');
        updateConfig({ lossRate: 0, corruptionRate: 0, minDelayMs: 30, maxDelayMs: 50 });
        engine.tcpHostB.listen();
        engine.triggerDropNext(); // Descarta o primeiro SYN
        engine.tcpHostA.connect(80);
        syncStateFromEngine();
        setScenarioNotice('Cenário 2 carregado: Primeiro SYN foi descartado intencionalmente. Aguarde o timeout para ver a retransmissão.');
        break;

      case 3: // TCP Perda do SYN-ACK
        changeProtocol('TCP');
        updateConfig({ lossRate: 0, corruptionRate: 0, minDelayMs: 30, maxDelayMs: 50 });
        engine.tcpHostB.listen();
        let synAckDropped = false;
        const sub = engine.eventBus.subscribe((log) => {
          if (log.host === 'Host B' && log.action === 'SEND_SYN_ACK' && !synAckDropped) {
            synAckDropped = true;
            engine.triggerDropNext();
            sub();
          }
        });
        engine.tcpHostA.connect(80);
        syncStateFromEngine();
        setScenarioNotice('Cenário 3 carregado: O segmento SYN-ACK do servidor será descartado no canal.');
        break;

      case 4: // TCP Encerramento Normal (4 Vias)
        changeProtocol('TCP');
        updateConfig({ lossRate: 0, corruptionRate: 0 });
        engine.tcpHostB.listen();
        engine.tcpHostA.connect(80);
        engine.runUntilQuiet(); // Handshake completo
        // A inicia FIN
        engine.tcpHostA.close(80);
        syncStateFromEngine();
        setScenarioNotice('Cenário 4 carregado: Encerramento normal de 4 vias (Host A enviou FIN). Use "Fechar B" ou clique em Iniciar para concluir o encerramento passivo.');
        break;

      case 5: // TCP Fechamento Simultâneo (CLOSING)
        changeProtocol('TCP');
        updateConfig({ lossRate: 0, corruptionRate: 0 });
        engine.tcpHostB.listen();
        engine.tcpHostA.connect(80);
        engine.runUntilQuiet(); // Handshake completo
        // Ambos enviam FIN simultaneamente
        engine.tcpHostA.close(80);
        engine.tcpHostB.close(10001);
        syncStateFromEngine();
        setScenarioNotice('Cenário 5 carregado: Fechamento simultâneo! Ambos enviaram FIN e passarão por CLOSING.');
        break;

      case 6: // TCP Perda de Dado & Fast Retransmit (3 ACKs Dup)
        changeProtocol('TCP');
        updateConfig({ lossRate: 0, corruptionRate: 0, minDelayMs: 20, maxDelayMs: 30 });
        engine.tcpHostB.listen();
        engine.tcpHostA.connect(80);
        engine.runUntilQuiet(); // Handshake completo

        // Envia 10 segmentos, descartando o 3º
        for (let i = 1; i <= 10; i++) {
          if (i === 3) engine.triggerDropNext();
          engine.tcpHostA.sendData(80, `Pkt_${i}`);
        }
        syncStateFromEngine();
        setScenarioNotice('Cenário 6 carregado: 10 pacotes enviados, o 3º foi descartado. Observe os 3 ACKs duplicados disparando o Fast Retransmit!');
        break;

      case 7: // TCP Porta Fechada (RST)
        changeProtocol('TCP');
        updateConfig({ lossRate: 0, corruptionRate: 0 });
        // Host B permanece em CLOSED (sem listen)
        engine.tcpHostA.connect(80);
        syncStateFromEngine();
        setScenarioNotice('Cenário 7 carregado: Host A conectando em porta fechada no Host B. Resposta esperada: RST.');
        break;

      case 8: // UDP 20 Datagramas c/ 30% Perda
        changeProtocol('UDP');
        updateConfig({ lossRate: 0.3, corruptionRate: 0, minDelayMs: 15, maxDelayMs: 30 });
        for (let i = 1; i <= 20; i++) {
          engine.udpHostA.send(53, `Datagrama_${i}`);
        }
        syncStateFromEngine();
        setScenarioNotice('Cenário 8 carregado: 20 datagramas UDP com 30% de perda no canal. Observe que não há recuperação.');
        break;

      case 9: // UDP Checksum Corrompido
        changeProtocol('UDP');
        updateConfig({ lossRate: 0, corruptionRate: 1.0 });
        engine.udpHostA.send(53, 'DadoComChecksumInvalido');
        syncStateFromEngine();
        setScenarioNotice('Cenário 9 carregado: Datagrama com bits alterados no canal. Receptor recalcula checksum de 16 bits e descarta silenciosamente.');
        break;

      case 10: // UDP vs TCP Comparativo
        setActiveTab('comparison');
        setScenarioNotice('Cenário 10: Visualização comparativa lado a lado carregada na aba correspondente.');
        break;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 flex flex-col gap-5">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
            <Network className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center gap-2">
              Simulador de FSMs de UDP e TCP
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 font-mono">
                Redes Convergentes - AV2
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Execução determinística, visualização de estados e ladder diagrams com verificação RFC e 10 cenários de teste.
            </p>
          </div>
        </div>

        {/* Abas Superiores e Seletor de Protocolo */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
          <button
            onClick={() => {
              setActiveTab('simulator');
              changeProtocol('TCP');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'simulator' && protocol === 'TCP'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Modo TCP
          </button>

          <button
            onClick={() => {
              setActiveTab('simulator');
              changeProtocol('UDP');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'simulator' && protocol === 'UDP'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Modo UDP
          </button>

          <button
            onClick={() => setActiveTab('comparison')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'comparison'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Split className="w-3.5 h-3.5" />
            Lado a Lado (Cenário 10)
          </button>
        </div>
      </header>

      {/* Alerta de Cenário Carregado */}
      {scenarioNotice && (
        <div className="bg-indigo-950/70 border border-indigo-800/80 px-4 py-2.5 rounded-xl flex items-center justify-between text-xs text-indigo-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{scenarioNotice}</span>
          </div>
          <button
            onClick={() => setScenarioNotice(null)}
            className="text-slate-400 hover:text-white font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Conteúdo Principal de acordo com a aba */}
      {activeTab === 'simulator' ? (
        <div className="flex flex-col gap-5">
          {/* Barra de Playback & Controles Gerais */}
          <PlaybackBar
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onStep={stepForward}
            onReset={() => resetSimulation()}
            speed={speedMultiplier}
            onSpeedChange={setSpeedMultiplier}
            virtualTime={virtualTime}
            protocol={protocol}
            onSelectScenario={loadScenario}
          />

          {/* Botões de Ações dos Hosts (Conectar, Enviar Dados, Fechar) */}
          <HostActionButtons
            protocol={protocol}
            stateA={stateA}
            stateB={stateB}
            onHostAConnect={() => {
              engine.tcpHostA.connect(80);
              syncStateFromEngine();
            }}
            onHostASendData={(data) => {
              engine.tcpHostA.sendData(80, data);
              syncStateFromEngine();
            }}
            onHostAClose={() => {
              engine.tcpHostA.close(80);
              syncStateFromEngine();
            }}
            onHostBListen={() => {
              engine.tcpHostB.listen();
              syncStateFromEngine();
            }}
            onHostBSendData={(data) => {
              engine.tcpHostB.sendData(10001, data);
              syncStateFromEngine();
            }}
            onHostBClose={() => {
              engine.tcpHostB.close(10001);
              syncStateFromEngine();
            }}
            onUDPSend={(data) => {
              engine.udpHostA.send(53, data);
              syncStateFromEngine();
            }}
          />

          {/* Sliders do Canal Simulado */}
          <ChannelPanel
            config={channelConfig}
            onUpdateConfig={updateConfig}
            onManualDrop={triggerManualDrop}
          />

          {/* Grade de Diagramas: Sequência (Ladder) à esquerda, Grafo de Estados (FSM) à direita */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-[460px]">
            <LadderDiagram items={sequenceItems} virtualTime={virtualTime} />
            <StateGraphView
              protocol={protocol}
              stateA={stateA}
              stateB={stateB}
              lastTransitionA={lastTransitionA}
              lastTransitionB={lastTransitionB}
            />
          </div>

          {/* Tabela de Logs e Eventos */}
          <EventLogTable logs={logs} />
        </div>
      ) : (
        /* Aba de Comparação Lado a Lado (Cenário 10) */
        <SideBySideView />
      )}
    </div>
  );
}
