import React, { useState } from 'react';
import { ProtocolType } from '../../../core/types';
import { Send, LogIn, PowerOff, Radio } from 'lucide-react';

interface HostActionButtonsProps {
  protocol: ProtocolType;
  stateA: string;
  stateB: string;
  onHostAConnect: () => void;
  onHostASendData: (data: string) => void;
  onHostAClose: () => void;
  onHostBListen: () => void;
  onHostBSendData: (data: string) => void;
  onHostBClose: () => void;
  onUDPSend: (data: string) => void;
}

export const HostActionButtons: React.FC<HostActionButtonsProps> = ({
  protocol,
  stateA,
  stateB,
  onHostAConnect,
  onHostASendData,
  onHostAClose,
  onHostBListen,
  onHostBSendData,
  onHostBClose,
  onUDPSend,
}) => {
  const [dataPayload, setDataPayload] = useState('Mensagem HTTP');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg flex flex-wrap items-center justify-between gap-4">
      {/* Ações do Host A */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-blue-400 bg-blue-950/60 border border-blue-800 px-2.5 py-1 rounded-lg">
          Host A (Cliente):
        </span>

        {protocol === 'TCP' ? (
          <>
            <button
              onClick={onHostAConnect}
              disabled={stateA !== 'CLOSED'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              Conectar (SYN)
            </button>

            <button
              onClick={() => onHostASendData(dataPayload)}
              disabled={stateA !== 'ESTABLISHED'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold transition"
            >
              <Send className="w-3.5 h-3.5" />
              Enviar Dados
            </button>

            <button
              onClick={onHostAClose}
              disabled={stateA !== 'ESTABLISHED'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold transition"
            >
              <PowerOff className="w-3.5 h-3.5" />
              Fechar (FIN)
            </button>
          </>
        ) : (
          <button
            onClick={() => onUDPSend(dataPayload)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar Datagrama UDP
          </button>
        )}
      </div>

      {/* Campo de Payload Customizado */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">Carga:</span>
        <input
          type="text"
          value={dataPayload}
          onChange={(e) => setDataPayload(e.target.value)}
          className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 w-44"
          placeholder="Texto a enviar..."
        />
      </div>

      {/* Ações do Host B */}
      {protocol === 'TCP' && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2.5 py-1 rounded-lg">
            Host B (Servidor):
          </span>

          <button
            onClick={onHostBListen}
            disabled={stateB !== 'CLOSED'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold transition"
          >
            <Radio className="w-3.5 h-3.5" />
            Ouvir (LISTEN)
          </button>

          <button
            onClick={() => onHostBSendData(dataPayload)}
            disabled={stateB !== 'ESTABLISHED'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold transition"
          >
            <Send className="w-3.5 h-3.5" />
            Enviar Dados B
          </button>

          <button
            onClick={onHostBClose}
            disabled={stateB !== 'ESTABLISHED' && stateB !== 'CLOSE_WAIT'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 text-white rounded-lg text-xs font-semibold transition"
          >
            <PowerOff className="w-3.5 h-3.5" />
            Fechar B (FIN)
          </button>
        </div>
      )}
    </div>
  );
};
