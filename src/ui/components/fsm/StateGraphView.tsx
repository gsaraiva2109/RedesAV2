import React from 'react';
import { ProtocolType } from '../../../core/types';
import { Network, Activity } from 'lucide-react';

interface StateGraphViewProps {
  protocol: ProtocolType;
  stateA: string;
  stateB: string;
  lastTransitionA: string;
  lastTransitionB: string;
}

interface NodePosition {
  id: string;
  label: string;
  x: number;
  y: number;
}

export const StateGraphView: React.FC<StateGraphViewProps> = ({
  protocol,
  stateA,
  stateB,
  lastTransitionA,
  lastTransitionB,
}) => {
  // Coordenadas dos nós da FSM TCP (layout didático inspirado nas figuras 3.41 e 3.42)
  const tcpNodes: NodePosition[] = [
    { id: 'CLOSED', label: 'CLOSED', x: 260, y: 40 },
    { id: 'LISTEN', label: 'LISTEN', x: 440, y: 100 },
    { id: 'SYN_SENT', label: 'SYN_SENT', x: 90, y: 130 },
    { id: 'SYN_RCVD', label: 'SYN_RCVD', x: 420, y: 190 },
    { id: 'ESTABLISHED', label: 'ESTABLISHED', x: 260, y: 250 },
    { id: 'FIN_WAIT_1', label: 'FIN_WAIT_1', x: 90, y: 330 },
    { id: 'FIN_WAIT_2', label: 'FIN_WAIT_2', x: 70, y: 410 },
    { id: 'CLOSING', label: 'CLOSING', x: 190, y: 410 },
    { id: 'TIME_WAIT', label: 'TIME_WAIT', x: 130, y: 490 },
    { id: 'CLOSE_WAIT', label: 'CLOSE_WAIT', x: 430, y: 340 },
    { id: 'LAST_ACK', label: 'LAST_ACK', x: 430, y: 440 },
  ];

  // Arestas principais da FSM TCP
  const tcpEdges: { from: string; to: string }[] = [
    { from: 'CLOSED', to: 'LISTEN' },
    { from: 'CLOSED', to: 'SYN_SENT' },
    { from: 'LISTEN', to: 'SYN_RCVD' },
    { from: 'SYN_SENT', to: 'ESTABLISHED' },
    { from: 'SYN_RCVD', to: 'ESTABLISHED' },
    { from: 'ESTABLISHED', to: 'FIN_WAIT_1' },
    { from: 'ESTABLISHED', to: 'CLOSE_WAIT' },
    { from: 'FIN_WAIT_1', to: 'FIN_WAIT_2' },
    { from: 'FIN_WAIT_1', to: 'CLOSING' },
    { from: 'FIN_WAIT_1', to: 'TIME_WAIT' },
    { from: 'FIN_WAIT_2', to: 'TIME_WAIT' },
    { from: 'CLOSING', to: 'TIME_WAIT' },
    { from: 'TIME_WAIT', to: 'CLOSED' },
    { from: 'CLOSE_WAIT', to: 'LAST_ACK' },
    { from: 'LAST_ACK', to: 'CLOSED' },
  ];

  const nodeMap = new Map(tcpNodes.map((n) => [n.id, n]));

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">
            Diagrama de Estados (FSM Graph) - {protocol}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span> Host A ({stateA})
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span> Host B ({stateB})
          </span>
        </div>
      </div>

      {/* Faixa de Última Transição Disparada */}
      <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-slate-400">Última transição A:</span>
          <span className="font-mono text-blue-300 font-medium">
            {lastTransitionA || '(nenhuma transição disparada)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-slate-400">Última transição B:</span>
          <span className="font-mono text-emerald-300 font-medium">
            {lastTransitionB || '(nenhuma transição disparada)'}
          </span>
        </div>
      </div>

      {/* Renderização do Grafo em SVG */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
        {protocol === 'TCP' ? (
          <svg viewBox="0 0 540 550" className="w-full max-w-[540px] h-auto select-none">
            <defs>
              <marker
                id="fsm-arrow"
                viewBox="0 0 10 10"
                refX="18"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#475569" />
              </marker>
            </defs>

            {/* Arestas de Conexão */}
            {tcpEdges.map((edge, idx) => {
              const fromN = nodeMap.get(edge.from);
              const toN = nodeMap.get(edge.to);
              if (!fromN || !toN) return null;

              return (
                <line
                  key={`edge_${idx}`}
                  x1={fromN.x}
                  y1={fromN.y}
                  x2={toN.x}
                  y2={toN.y}
                  stroke="#334155"
                  strokeWidth="2"
                  markerEnd="url(#fsm-arrow)"
                />
              );
            })}

            {/* Nós dos Estados */}
            {tcpNodes.map((node) => {
              const isHostA = stateA === node.id;
              const isHostB = stateB === node.id;

              let nodeFill = '#1e293b';
              let nodeStroke = '#475569';
              let strokeWidth = 1.5;

              if (isHostA && isHostB) {
                nodeFill = '#1e1b4b';
                nodeStroke = '#a855f7';
                strokeWidth = 3;
              } else if (isHostA) {
                nodeFill = '#172554';
                nodeStroke = '#3b82f6';
                strokeWidth = 2.5;
              } else if (isHostB) {
                nodeFill = '#064e3b';
                nodeStroke = '#10b981';
                strokeWidth = 2.5;
              }

              return (
                <g key={node.id} className="transition-all duration-300">
                  {/* Círculo do Estado */}
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={26}
                    fill={nodeFill}
                    stroke={nodeStroke}
                    strokeWidth={strokeWidth}
                    className={(isHostA || isHostB) ? 'filter drop-shadow-[0_0_8px_rgba(59,130,246,0.6)]' : ''}
                  />

                  {/* Rótulo do Estado */}
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fill={(isHostA || isHostB) ? '#ffffff' : '#94a3b8'}
                    fontSize="9.5"
                    fontWeight="bold"
                    fontFamily="monospace"
                  >
                    {node.label}
                  </text>

                  {/* Crachás de Ativação do Host A / Host B */}
                  {isHostA && (
                    <g transform={`translate(${node.x - 28}, ${node.y - 34})`}>
                      <rect width="26" height="14" rx="4" fill="#2563eb" />
                      <text x="13" y="10" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">
                        A
                      </text>
                    </g>
                  )}

                  {isHostB && (
                    <g transform={`translate(${node.x + 2}, ${node.y - 34})`}>
                      <rect width="26" height="14" rx="4" fill="#059669" />
                      <text x="13" y="10" textAnchor="middle" fill="#ffffff" fontSize="8" fontWeight="bold">
                        B
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          /* Visualizador de FSM UDP de Estado Único */
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="relative">
              <div className="w-40 h-40 rounded-full bg-emerald-950/60 border-4 border-emerald-500 flex flex-col items-center justify-center shadow-lg shadow-emerald-500/20">
                <span className="text-xl font-bold font-mono text-emerald-300">OPEN</span>
                <span className="text-xs text-slate-400 mt-1">Estado Único</span>
              </div>
              <div className="absolute -top-3 left-4 bg-blue-600 px-2 py-0.5 rounded text-xs font-bold text-white shadow">
                Host A
              </div>
              <div className="absolute -top-3 right-4 bg-emerald-600 px-2 py-0.5 rounded text-xs font-bold text-white shadow">
                Host B
              </div>
            </div>
            <p className="text-xs text-slate-400 max-w-sm mt-6">
              O UDP é completamente <strong>sem conexão</strong>. Não possui handshake, controle de estados de conexão ou retransmissões. A FSM permanece permanentemente pronta no estado único <code className="text-emerald-400">OPEN</code>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
