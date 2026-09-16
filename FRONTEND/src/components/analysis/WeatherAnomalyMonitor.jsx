import { Flame, CloudRain, Gauge, Wind } from 'lucide-react';

export function WeatherAnomalyMonitor({ locationName = 'Selected Region' }) {
  const anomalyCards = [
    {
      id: 'rain',
      title: 'RAINFALL ANOMALY',
      status: 'ABOVE HISTORICAL BASELINE',
      severity: 'SEVERE',
      current: '68.4 mm/h',
      baseline: '28.0 mm/h',
      deviation: '+40.4 mm/h (+144%)',
      percentile: '96th %ile',
      icon: CloudRain,
      color: 'border-rose-500/40 bg-rose-950/20 text-rose-300',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      commentary: 'Exceeds 95th percentile historical threshold for mid-September precipitation events.',
    },
    {
      id: 'temp',
      title: 'TEMPERATURE ANOMALY',
      status: 'UNUSUAL DEPARTURE FROM BASELINE',
      severity: 'MODERATE',
      current: '31.8 °C',
      baseline: '28.5 °C',
      deviation: '+3.3 °C anomaly',
      percentile: '86th %ile',
      icon: Flame,
      color: 'border-amber-500/40 bg-amber-950/20 text-amber-300',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      commentary: 'High minimum night temperatures due to dense cloud insulation and moisture trapping.',
    },
    {
      id: 'pressure',
      title: 'PRESSURE ANOMALY',
      status: 'RAPID BAROMETRIC DESCENT',
      severity: 'WATCH',
      current: '1003.2 hPa',
      baseline: '1009.5 hPa',
      deviation: '-6.3 hPa deep trough',
      percentile: '12th %ile (low)',
      icon: Gauge,
      color: 'border-indigo-500/40 bg-indigo-950/20 text-indigo-300',
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      commentary: 'Steep pressure gradient consistent with an active cyclonic circulation aloft.',
    },
    {
      id: 'wind',
      title: 'WIND ANOMALY',
      status: 'CONVECTIVE GUST ACCELERATION',
      severity: 'ELEVATED',
      current: '42 km/h (gusts 58)',
      baseline: '18 km/h',
      deviation: '+24 km/h surge',
      percentile: '91st %ile',
      icon: Wind,
      color: 'border-cyan-500/40 bg-cyan-950/20 text-cyan-300',
      badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      commentary: 'Downdraft outflow boundaries generating localized wind shearing.',
    },
  ];

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
              Automated Anomaly Monitor &amp; Departure Classification
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              {locationName}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Continuous background anomaly scans detecting multi-sensor deviations exceeding statistical climatology.
          </p>
        </div>

        <span className="text-[11px] font-mono text-emerald-400 font-semibold">
          ● 4 Anomalies Active
        </span>
      </div>

      {/* 4 Anomaly Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {anomalyCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`p-4 rounded-xl border flex flex-col justify-between ${card.color}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-mono font-extrabold tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" />
                    {card.title}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${card.badge}`}>
                    {card.severity}
                  </span>
                </div>

                <div className="text-xs font-bold text-white mb-2 leading-tight">
                  {card.status}
                </div>

                <div className="space-y-1 font-mono text-xs mb-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Value:</span>
                    <span className="font-bold text-white">{card.current}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Climatology:</span>
                    <span className="text-slate-300">{card.baseline}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1 font-bold">
                    <span className="text-slate-200">Deviation:</span>
                    <span>{card.deviation}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-400">Percentile:</span>
                    <span className="font-bold text-[#d4dcff]">{card.percentile}</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 text-[10px] text-slate-300 leading-tight">
                {card.commentary}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
