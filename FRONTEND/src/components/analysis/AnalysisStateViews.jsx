import { AlertTriangle, RefreshCw, Database, CloudOff } from 'lucide-react';

export function LoadingState({ message = 'Loading weather analysis...' }) {
  return (
    <div className="w-full py-16 px-4 flex flex-col items-center justify-center text-center">
      <div className="relative mb-5">
        <div className="w-14 h-14 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Database className="w-5 h-5 text-blue-600 animate-pulse" />
        </div>
      </div>
      <h3 className="text-base font-semibold text-slate-800 tracking-tight">{message}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm">
        Retrieving verified observation data from ISRO MOSDAC satellite feeds & regional PostGIS sensors.
      </p>
    </div>
  );
}

export function ErrorState({ message = 'Unable to load analysis data.', onRetry }) {
  return (
    <div className="w-full py-14 px-6 my-4 bg-amber-50/70 border border-amber-200/90 rounded-2xl flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mb-3.5 shadow-xs">
        <AlertTriangle className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-slate-900">Analysis Data Unavailable</h3>
      <p className="text-xs text-slate-600 mt-1 max-w-md">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-sm shadow-blue-600/20"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Request</span>
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title = 'No weather data available',
  description = 'No observation records found for this location and time range.',
  action,
}) {
  return (
    <div className="w-full py-12 px-6 my-4 bg-slate-50/80 border border-slate-200 rounded-2xl flex flex-col items-center justify-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-slate-200/70 text-slate-600 flex items-center justify-center mb-3">
        <CloudOff className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500 mt-1 max-w-sm">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
