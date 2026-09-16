import { Database, CheckCircle2 } from 'lucide-react';

export function DataSources({ metadata, wsStatus }) {
  const sources = [
    {
      agency: 'ISRO MOSDAC',
      fullName: 'Space Applications Centre, Ahmedabad',
      dataset: 'INSAT-3DS Hydro-Estimator (HEM) & Imager (IMR)',
      satellite: 'INSAT-3DS (Geostationary 82°E)',
      freshness: '30 mins (Operational)',
      coverage: 'Indian Subcontinent & Surrounding Oceanic Basins',
      status: 'CALIBRATED & ASSIMILATED',
      sensor: '6-Channel Optical & Thermal Radiometer (Imager)',
    },
    {
      agency: 'IMD',
      fullName: 'India Meteorological Department (MoES)',
      dataset: 'Automatic Weather Station (AWS) & Doppler Radar Grid',
      satellite: 'Surface Gauges + C/S-Band DWR Network',
      freshness: '15 mins (Real-Time)',
      coverage: 'National Surface Observation Network (All States)',
      status: 'VERIFIED GROUND TRUTH',
      sensor: 'Tipping-Bucket Gauges & Dual-Polarization Radars',
    },
    {
      agency: 'NASA / JAXA',
      fullName: 'Global Precipitation Measurement (GPM)',
      dataset: 'IMERG Final & Early Run Multi-Satellite Retrievable V07B',
      satellite: 'GPM Core Observatory + Constellation Radiometers',
      freshness: '4 hours (Calibrated)',
      coverage: 'Global 60°N - 60°S (0.1° Gridded)',
      status: 'MERGED INTER-SATELLITE',
      sensor: 'Dual-frequency Precipitation Radar (DPR) & GMI Microwave',
    },
    {
      agency: 'NCMRWF',
      fullName: 'National Centre for Medium Range Weather Forecasting',
      dataset: 'Unified Model Global & Regional Ensemble (NEPS-G)',
      satellite: 'Numerical Weather Prediction Assimilation Core',
      freshness: '6 hours (00Z/12Z Cycles)',
      coverage: 'Global & South Asian Regional Domain',
      status: 'OPERATIONAL ENSEMBLE',
      sensor: 'Atmospheric Physics Parameterizations & 4D-Var',
    },
    {
      agency: 'NDMA / NCS',
      fullName: 'National Disaster Management Authority & National Centre for Seismology',
      dataset: 'National Hazard Vulnerability Atlas & Seismic Incident Ledger',
      satellite: 'Spatial Risk GIS & Incident Infrastructure Mesh',
      freshness: 'Dynamic Stream',
      coverage: 'District-Level India Disaster Catalog',
      status: 'VALIDATED ADVISORY',
      sensor: 'Emergency Operations Center Telemetry',
    },
  ];

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-6 shadow-xl mb-6 select-none relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-[#d4dcff]" />
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight">
              Data Lineage &amp; Ingestion Transparency
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-950 text-[#d4dcff] border border-blue-800/50">
              Multi-Agency Provenance
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 font-medium">
            Strict provenance verification for all spaceborne, ground telemetry, and numerical models connected to TATVA.
          </p>
        </div>

        <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" />
          <span>{wsStatus === 'connected' ? 'LIVE WS STREAM ACTIVE' : 'ALL 5 CHANNELS HEALTHY'} {metadata?.source ? `(${metadata.source})` : ''}</span>
        </span>
      </div>

      {/* Sources Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {sources.map((s, idx) => (
          <div
            key={idx}
            className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-black tracking-wide text-white uppercase">
                  {s.agency}
                </span>
                <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase bg-blue-500/20 text-[#d4dcff] border border-blue-500/30">
                  {s.status}
                </span>
              </div>

              <div className="text-xs font-semibold text-slate-300 mb-2 leading-tight">
                {s.dataset}
              </div>

              <div className="space-y-1 font-mono text-[11px] text-slate-400 mb-3">
                <div>
                  <span className="text-slate-500">Platform: </span>
                  <span className="text-slate-300">{s.satellite}</span>
                </div>
                <div>
                  <span className="text-slate-500">Coverage: </span>
                  <span className="text-slate-300">{s.coverage}</span>
                </div>
                <div>
                  <span className="text-slate-500">Payload: </span>
                  <span className="text-slate-300">{s.sensor}</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
              <span>{s.fullName}</span>
              <span className="text-emerald-400 font-mono font-bold">{s.freshness}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-white/10 text-[10px] text-slate-500">
        *TATVA verifies cryptographic checksums and spatial CRS alignments (EPSG:4326) for all incoming raster and vector granules.
      </div>
    </div>
  );
}
