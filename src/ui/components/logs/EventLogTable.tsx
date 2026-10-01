import React, { useState, useMemo } from 'react';
import { SimLogEntry } from '../../../core/types';
import { ListFilter, Search, Download } from 'lucide-react';

interface EventLogTableProps {
  logs: SimLogEntry[];
}

export const EventLogTable: React.FC<EventLogTableProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHost, setSelectedHost] = useState<'ALL' | 'Host A' | 'Host B' | 'Channel'>('ALL');

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchHost = selectedHost === 'ALL' || log.host === selectedHost;
      const matchText =
        searchTerm === '' ||
        log.event.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.details && log.details.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.previousState && log.previousState.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (log.newState && log.newState.toLowerCase().includes(searchTerm.toLowerCase()));

      return matchHost && matchText;
    });
  }, [logs, searchTerm, selectedHost]);

  const exportLogsAsCSV = () => {
    const headers = ['Tempo (ms)', 'Host', 'Estado Anterior', 'Evento', 'Ação', 'Novo Estado', 'Detalhes'];
    const rows = filteredLogs.map((l) => [
      l.virtualTime,
      l.host,
      l.previousState || '-',
      l.event,
      l.action,
      l.newState || '-',
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `logs_simulacao_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-full max-h-[380px]">
      {/* Barra de Filtros */}
      <div className="p-3 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-slate-200">
            Log de Eventos e Transições FSM ({filteredLogs.length})
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Busca por texto */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
            <input
              type="text"
              placeholder="Filtrar eventos, ações..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 w-44"
            />
          </div>

          {/* Filtro de Host */}
          <select
            value={selectedHost}
            onChange={(e) => setSelectedHost(e.target.value as any)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">Todos os Hosts</option>
            <option value="Host A">Host A</option>
            <option value="Host B">Host B</option>
            <option value="Channel">Canal</option>
          </select>

          {/* Exportar CSV */}
          <button
            onClick={exportLogsAsCSV}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
            title="Exportar registros filtrados para o relatório"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Tabela de Registros */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-950 sticky top-0 text-slate-400 border-b border-slate-800">
            <tr>
              <th className="py-2 px-3 font-semibold">Tempo</th>
              <th className="py-2 px-3 font-semibold">Host</th>
              <th className="py-2 px-3 font-semibold">Estado Anterior</th>
              <th className="py-2 px-3 font-semibold">Evento</th>
              <th className="py-2 px-3 font-semibold">Ação</th>
              <th className="py-2 px-3 font-semibold">Novo Estado</th>
              <th className="py-2 px-3 font-semibold">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {filteredLogs.map((log) => {
              let hostBadgeColor = 'bg-slate-800 text-slate-300';
              if (log.host === 'Host A') hostBadgeColor = 'bg-blue-950 text-blue-300 border border-blue-800';
              if (log.host === 'Host B') hostBadgeColor = 'bg-emerald-950 text-emerald-300 border border-emerald-800';
              if (log.host === 'Channel') hostBadgeColor = 'bg-amber-950 text-amber-300 border border-amber-800';

              return (
                <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-1.5 px-3 text-slate-400 whitespace-nowrap">{log.virtualTime}ms</td>
                  <td className="py-1.5 px-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${hostBadgeColor}`}>
                      {log.host}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-slate-300 whitespace-nowrap">{log.previousState || '-'}</td>
                  <td className="py-1.5 px-3 text-cyan-300 font-semibold whitespace-nowrap">{log.event}</td>
                  <td className="py-1.5 px-3 text-amber-300 whitespace-nowrap">{log.action}</td>
                  <td className="py-1.5 px-3 text-emerald-400 font-semibold whitespace-nowrap">{log.newState || '-'}</td>
                  <td className="py-1.5 px-3 text-slate-400 text-[11px] truncate max-w-xs" title={log.details}>
                    {log.details}
                  </td>
                </tr>
              );
            })}
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-slate-500">
                  Nenhum evento registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
