import React, { useRef, useEffect } from 'react';
import { SequenceDiagramItem } from '../../../core/types';
import { AlertTriangle, XCircle, ArrowRight } from 'lucide-react';

interface LadderDiagramProps {
  items: SequenceDiagramItem[];
  virtualTime: number;
}

export const LadderDiagram: React.FC<LadderDiagramProps> = ({ items, virtualTime }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para o evento mais recente
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [items.length]);

  const xA = 100;
  const xB = 460;
  const rowHeight = 65;
  const totalHeight = Math.max(380, items.length * rowHeight + 120);

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <ArrowRight className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">
            Diagrama de Sequência (Ladder Diagram)
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="w-2.5 h-0.5 bg-emerald-400 inline-block"></span> Entregue
          </span>
          <span className="flex items-center gap-1.5 text-amber-400">
            <span className="w-2.5 h-0.5 bg-amber-400 inline-block"></span> Retransmitido
          </span>
          <span className="flex items-center gap-1.5 text-rose-400">
            <span className="w-2.5 h-0.5 bg-rose-400 border-dashed inline-block"></span> Perdido / Cortado
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden relative p-4 scroll-smooth"
      >
        <svg width="100%" height={totalHeight} className="min-w-[560px]">
          {/* Marcadores de Seta */}
          <defs>
            <marker
              id="arrow-emerald"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
            <marker
              id="arrow-amber"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
            </marker>
            <marker
              id="arrow-indigo"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1" />
            </marker>
          </defs>

          {/* Eixos Verticais dos Hosts */}
          <line
            x1={xA}
            y1={40}
            x2={xA}
            y2={totalHeight - 20}
            stroke="#475569"
            strokeWidth="3"
            strokeDasharray="4 4"
          />
          <line
            x1={xB}
            y1={40}
            x2={xB}
            y2={totalHeight - 20}
            stroke="#475569"
            strokeWidth="3"
            strokeDasharray="4 4"
          />

          {/* Cabeçalhos dos Hosts */}
          <g>
            <rect x={xA - 55} y={8} width={110} height={28} rx={6} fill="#1e293b" stroke="#3b82f6" strokeWidth={1.5} />
            <text x={xA} y={26} textAnchor="middle" fill="#93c5fd" fontSize="12" fontWeight="bold">
              Host A (Cliente)
            </text>

            <rect x={xB - 55} y={8} width={110} height={28} rx={6} fill="#1e293b" stroke="#10b981" strokeWidth={1.5} />
            <text x={xB} y={26} textAnchor="middle" fill="#6ee7b7" fontSize="12" fontWeight="bold">
              Host B (Servidor)
            </text>
          </g>

          {/* Renderização de cada segmento transmitido */}
          {items.map((item, index) => {
            const yStart = 60 + index * rowHeight;
            const yEnd = yStart + 35;
            const isFromA = item.fromHost === 'A';
            const x1 = isFromA ? xA : xB;
            const x2Target = isFromA ? xB : xA;
            const isLost = item.status === 'lost';
            const isCorrupt = item.status === 'corrupted';

            // Se for perdido, a linha é cortada no meio do caminho
            const x2 = isLost ? (isFromA ? (xA + xB) / 2 : (xA + xB) / 2) : x2Target;
            const y2 = isLost ? (yStart + yEnd) / 2 : yEnd;

            let strokeColor = '#10b981'; // Emerald padrão
            let markerId = 'arrow-emerald';

            if (item.isRetransmission) {
              strokeColor = '#f59e0b'; // Amber para retransmissões
              markerId = 'arrow-amber';
            } else if (item.packet.protocol === 'UDP') {
              strokeColor = '#818cf8'; // Indigo para UDP
              markerId = 'arrow-indigo';
            }

            if (isCorrupt) {
              strokeColor = '#ef4444';
            }

            return (
              <g key={item.id} className="transition-all duration-300">
                {/* Linha da Seta */}
                <line
                  x1={x1}
                  y1={yStart}
                  x2={x2}
                  y2={y2}
                  stroke={strokeColor}
                  strokeWidth={item.isRetransmission ? 2.5 : 2}
                  strokeDasharray={isLost ? '5 5' : 'none'}
                  markerEnd={isLost ? undefined : `url(#${markerId})`}
                />

                {/* Marcador de Descarte / Corte Visual */}
                {isLost && (
                  <g transform={`translate(${x2 - 10}, ${y2 - 10})`}>
                    <circle cx="10" cy="10" r="10" fill="#ef4444" />
                    <line x1="6" y1="6" x2="14" y2="14" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                    <line x1="14" y1="6" x2="6" y2="14" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}

                {/* Rótulo do Segmento */}
                <g transform={`translate(${(x1 + x2) / 2}, ${(yStart + y2) / 2 - 10})`}>
                  <rect
                    x={-80}
                    y={-11}
                    width={160}
                    height={20}
                    rx={4}
                    fill="#0f172a"
                    stroke={strokeColor}
                    strokeWidth={1}
                    opacity={0.92}
                  />
                  <text
                    x={0}
                    y={3}
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="monospace"
                  >
                    {item.isRetransmission ? `[RETRANS] ` : ''}
                    {item.label}
                  </text>
                </g>

                {/* Marcação de tempo */}
                <text
                  x={isFromA ? xA - 15 : xB + 15}
                  y={yStart + 4}
                  textAnchor={isFromA ? 'end' : 'start'}
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {item.startTime}ms
                </text>
              </g>
            );
          })}
        </svg>

        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm">
            <span>Nenhum pacote transmitido ainda.</span>
            <span className="text-xs text-slate-600 mt-1">
              Inicie a conexão ou envie dados para visualizar o diagrama de sequência.
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
