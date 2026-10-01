import React from 'react';
import { ChannelConfig } from '../../../core/types';
import { Sliders, Scissors, Shuffle } from 'lucide-react';

interface ChannelPanelProps {
  config: ChannelConfig;
  onUpdateConfig: (newCfg: Partial<ChannelConfig>) => void;
  onManualDrop: () => void;
}

export const ChannelPanel: React.FC<ChannelPanelProps> = ({
  config,
  onUpdateConfig,
  onManualDrop,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Parâmetros do Canal Simulado</h3>
        </div>
        <button
          onClick={onManualDrop}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all shadow ${
            config.dropNextSegment
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-rose-950/60 border border-rose-800/80 text-rose-300 hover:bg-rose-900'
          }`}
          title="Força o descarte do próximo pacote transmitido deterministicamente"
        >
          <Scissors className="w-3.5 h-3.5" />
          {config.dropNextSegment ? 'Próximo será descartado!' : 'Descartar Próximo (1 Clique)'}
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
        {/* Probabilidade de Perda */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-slate-300">
            <span>Perda:</span>
            <span className="font-mono text-cyan-400 font-bold">
              {(config.lossRate * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.lossRate}
            onChange={(e) => onUpdateConfig({ lossRate: parseFloat(e.target.value) })}
            className="accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Probabilidade de Corrupção */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-slate-300">
            <span>Corrupção:</span>
            <span className="font-mono text-cyan-400 font-bold">
              {(config.corruptionRate * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={config.corruptionRate}
            onChange={(e) => onUpdateConfig({ corruptionRate: parseFloat(e.target.value) })}
            className="accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Atraso Mínimo (ms) */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-slate-300">
            <span>Delay Mín:</span>
            <span className="font-mono text-cyan-400 font-bold">{config.minDelayMs}ms</span>
          </div>
          <input
            type="range"
            min="5"
            max="200"
            step="5"
            value={config.minDelayMs}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              onUpdateConfig({
                minDelayMs: val,
                maxDelayMs: Math.max(val, config.maxDelayMs),
              });
            }}
            className="accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Atraso Máximo (ms) */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-slate-300">
            <span>Delay Máx:</span>
            <span className="font-mono text-cyan-400 font-bold">{config.maxDelayMs}ms</span>
          </div>
          <input
            type="range"
            min="5"
            max="400"
            step="5"
            value={config.maxDelayMs}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              onUpdateConfig({
                maxDelayMs: Math.max(config.minDelayMs, val),
              });
            }}
            className="accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Duplicação */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-slate-300">
            <span>Duplicação:</span>
            <span className="font-mono text-cyan-400 font-bold">
              {(config.duplicationRate * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="0.5"
            step="0.05"
            value={config.duplicationRate}
            onChange={(e) => onUpdateConfig({ duplicationRate: parseFloat(e.target.value) })}
            className="accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
        </div>

        {/* Semente Aleatória (Seed) */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-slate-300">
            <span className="flex items-center gap-1">
              <Shuffle className="w-3 h-3 text-slate-400" /> Semente:
            </span>
            <span className="font-mono text-cyan-400 font-bold">{config.seed}</span>
          </div>
          <input
            type="number"
            value={config.seed}
            onChange={(e) => onUpdateConfig({ seed: parseInt(e.target.value) || 0 })}
            className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>
    </div>
  );
};
