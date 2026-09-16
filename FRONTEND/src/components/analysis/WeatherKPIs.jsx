import {
  TrendingUp,
  TrendingDown,
  Minus,
  CloudRain,
  Thermometer,
  CloudLightning,
  Wind,
  Gauge,
  Droplets,
  AlertTriangle,
  History,
} from 'lucide-react';

function SparklineSvg({ data = [], color = '#38bdf8' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 84;
  const height = 28;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 6) - 3;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {/* Final point dot */}
      {data.length > 0 && (
        <circle
          cx={width}
          cy={height - ((data[data.length - 1] - min) / range) * (height - 6) - 3}
          r="2.5"
          fill={color}
        />
      )}
    </svg>
  );
}

export function WeatherKPIs({ kpiData }) {
  if (!kpiData || !kpiData.kpis) {
    return (
      <div className="w-full mb-8 select-none">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl bg-[#081226]/60 border border-blue-900/30 animate-pulse h-28" />
          ))}
        </div>
      </div>
    );
  }
  const { kpis, location, timestamp, source } = kpiData;

  const iconMap = {
    rainfallAnomaly: CloudRain,
    temperatureAnomaly: Thermometer,
    forecastRainfall: CloudLightning,
    humidity: Droplets,
    windSpeed: Wind,
    pressure: Gauge,
    hazardProbability: AlertTriangle,
    historicalPercentile: History,
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'severe':
        return {
          badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
          sparkColor: '#f43f5e',
          text: 'Severe Departure',
        };
      case 'elevated':
        return {
          badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
          sparkColor: '#fbbf24',
          text: 'Elevated Watch',
        };
      default:
        return {
          badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          sparkColor: '#38bdf8',
          text: 'Nominal Range',
        };
    }
  };

  return (
    <div className="w-full mb-8 select-none">
      {/* KPI Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 px-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-extrabold uppercase tracking-wider text-slate-400">
            ATMOSPHERIC STATE MATRIX
          </span>
          <span className="text-xs text-slate-500 font-medium">
            &bull; {location?.name} ({timestamp})
          </span>
        </div>

        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-950/80 text-[#d4dcff] border border-blue-800/40">
          Source: {source || 'Calibrated Ground / Satellite Telemetry'}
        </span>
      </div>

      {/* 8 Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {Object.entries(kpis).map(([key, item]) => {
          const Icon = iconMap[key] || CloudRain;
          const statusStyle = getStatusStyle(item.status);
          const isUp = item.direction === 'up';
          const isDown = item.direction === 'down';

          return (
            <div
              key={key}
              className="relative p-4 rounded-2xl bg-[#081226]/90 border border-blue-900/40 hover:border-blue-700/60 shadow-lg hover:shadow-xl transition-all duration-200 flex flex-col justify-between group overflow-hidden"
            >
              {/* Subtle top edge glow */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#d4dcff]/20 to-transparent" />

              <div>
                {/* Header row: Title + Icon */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    {item.title}
                  </span>
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-[#d4dcff] group-hover:scale-105 transition-transform">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Value row with sparkline */}
                <div className="flex items-baseline justify-between gap-2 my-1">
                  <span className="text-xl sm:text-2xl font-black text-white font-mono tracking-tight">
                    {item.current}
                  </span>
                  <div className="shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    <SparklineSvg data={item.sparkline} color={statusStyle.sparkColor} />
                  </div>
                </div>
              </div>

              {/* Bottom stats row */}
              <div className="pt-2.5 mt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1 font-semibold truncate text-slate-300">
                  {isUp && <TrendingUp className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  {isDown && <TrendingDown className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                  {!isUp && !isDown && <Minus className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                  <span className="truncate">{item.change}</span>
                </div>

                <span
                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase shrink-0 border ${statusStyle.badge}`}
                >
                  {statusStyle.text}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
