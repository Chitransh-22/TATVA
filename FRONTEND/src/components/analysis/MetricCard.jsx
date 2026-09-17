export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  badgeText,
  badgeVariant = 'neutral', // 'neutral' | 'info' | 'success' | 'warning' | 'danger'
  icon: Icon,
  isUnavailable = false,
  unavailableReason = 'Telemetry parameter not present in active feed',
}) {
  const badgeStyles = {
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
  };

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 flex flex-col justify-between transition-all duration-200 bg-white ${
        isUnavailable ? 'border-slate-200/60 bg-slate-50/40 opacity-75' : 'border-slate-200/90 shadow-xs hover:shadow-md'
      }`}
    >
      {/* Header: Title & Icon */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-col">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            {title}
          </span>
          {badgeText && !isUnavailable && (
            <span
              className={`inline-block mt-1 self-start px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                badgeStyles[badgeVariant] || badgeStyles.neutral
              }`}
            >
              {badgeText}
            </span>
          )}
        </div>
        {Icon && (
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isUnavailable ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600'
            }`}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {/* Main Value Display */}
      <div className="my-1">
        {isUnavailable ? (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-400 italic">
              Data unavailable
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5">
              {unavailableReason}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-mono">
              {value}
            </span>
            {unit && (
              <span className="text-xs sm:text-sm font-semibold text-slate-500">
                {unit}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Subtitle / Context Note */}
      {subtitle && !isUnavailable && (
        <p className="text-[11px] text-slate-500 mt-2 border-t border-slate-100 pt-2 line-clamp-1">
          {subtitle}
        </p>
      )}
    </div>
  );
}
