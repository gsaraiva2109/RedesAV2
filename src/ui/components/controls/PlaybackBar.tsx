import React from 'react';
import { Play, Pause, SkipForward, RotateCcw, FastForward, Clock, Bookmark } from 'lucide-react';
import { ProtocolType } from '../../../core/types';

interface PlaybackBarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStep: () => void;
  onReset: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  virtualTime: number;
  protocol: ProtocolType;
  onSelectScenario: (scenarioNum: number) => void;
}

export const PlaybackBar: React.FC<PlaybackBarProps> = ({
  isPlaying,
  onTogglePlay,
  onStep,
  onReset,
  speed,
  onSpeedChange,
  virtualTime,
  protocol,
  onSelectScenario,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg flex flex-wrap items-center justify-between gap-3">
      {/* Botões de Playback Principal */}
      <div className="flex items-center gap-2">
        <button
          onClick={onTogglePlay}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition shadow ${
            isPlaying
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isPlaying ? 'Pausar' : 'Iniciar'}
        </button>

        <button
          onClick={onStep}
          disabled={isPlaying}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 transition"
          title="Avança exatamente um evento discreto no relógio virtual"
        >
          <SkipForward className="w-4 h-4 text-indigo-400" />
          Passo a Passo
        </button>

        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-rose-300 transition"
          title="Reinicia o relógio virtual e os estados"
        >
          <RotateCcw className="w-4 h-4 text-rose-400" />
          Reset
        </button>
      </div>

      {/* Controle de Velocidade */}
      <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
        <FastForward className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-slate-400">Velocidade:</span>
        {[0.5, 1, 2, 5].map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-2 py-0.5 rounded text-xs font-semibold transition ${
              speed === s
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Relógio Virtual */}
      <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1.5 rounded-lg border border-slate-800">
        <Clock className="w-4 h-4 text-amber-400" />
        <span className="text-xs text-slate-400">Tempo Virtual:</span>
        <span className="text-xs font-mono font-bold text-amber-300 min-w-[50px]">
          {virtualTime} ms
        </span>
      </div>

      {/* Seletor de Cenários Pré-programados (1 a 10) */}
      <div className="flex items-center gap-2 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
        <Bookmark className="w-3.5 h-3.5 text-indigo-400" />
        <span className="text-slate-400 font-medium">Cenário:</span>
        <select
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (val > 0) onSelectScenario(val);
          }}
          defaultValue=""
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
        >
          <option value="" disabled>Carregar Cenário Oficial...</option>
          <option value="1">1. TCP Handshake sem Falhas</option>
          <option value="2">2. TCP Perda do SYN (Timeout)</option>
          <option value="3">3. TCP Perda do SYN-ACK (Retransmissão)</option>
          <option value="4">4. TCP Encerramento Normal (4 Vias)</option>
          <option value="5">5. TCP Fechamento Simultâneo (CLOSING)</option>
          <option value="6">6. TCP Perda de Dado & Fast Retransmit (3 Dup ACKs)</option>
          <option value="7">7. TCP Porta Fechada (Resposta RST)</option>
          <option value="8">8. UDP 20 Datagramas c/ 30% Perda</option>
          <option value="9">9. UDP Checksum Corrompido (Descarte Silencioso)</option>
          <option value="10">10. UDP vs TCP (Mesmo Canal Ruidoso)</option>
        </select>
      </div>
    </div>
  );
};
