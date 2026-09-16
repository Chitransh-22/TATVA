import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

export function AIExplanationPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full bg-[#081226]/95 border border-blue-900/40 rounded-2xl p-4 sm:p-5 shadow-xl mb-6 select-none transition-all">
      {/* Accordion Toggle Bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left cursor-pointer group"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-[#d4dcff] group-hover:scale-105 transition-transform">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              Explainable Weather Intelligence: How did TATVA reach this conclusion?
            </h3>
            <p className="text-xs text-slate-300 font-medium">
              Transparent breakdown of multi-sensor data fusion, physical parameterizations, and model uncertainty.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 hidden sm:inline-block">
            {isOpen ? 'Collapse Framework' : 'Inspect Methodology'}
          </span>
          <div className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 group-hover:text-white">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </button>

      {/* Expandable Explanation Details */}
      {isOpen && (
        <div className="mt-5 pt-4 border-t border-white/10 space-y-4 text-xs text-slate-300 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Column 1: Input Data & Features */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#d4dcff]">
                01 &bull; Input Datasets &amp; Features Analyzed
              </div>
              <ul className="space-y-1.5 text-slate-300">
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-400">&bull;</span>
                  <span><strong>INSAT-3DS Imager:</strong> TIR1 &amp; Water Vapor brightness temperatures (4 km resolution).</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-400">&bull;</span>
                  <span><strong>IMD Doppler Radar Network:</strong> MAXZ column reflectivity (&gt;45 dBZ) and radial velocity shear.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-400">&bull;</span>
                  <span><strong>Global Precipitation Measurement (GPM):</strong> IMERG 0.1° calibrated rain-rate benchmarks.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-400">&bull;</span>
                  <span><strong>Unified NWP Models:</strong> NCMRWF &amp; GFS 850-500 hPa vorticity, moisture flux divergence, and CAPE.</span>
                </li>
              </ul>
            </div>

            {/* Column 2: Analytical Methodology */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#d4dcff]">
                02 &bull; Analytical Methodology &amp; Synthesis
              </div>
              <ul className="space-y-1.5 text-slate-300">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-400">&bull;</span>
                  <span><strong>Spatial Interpolation &amp; Masking:</strong> PostGIS raster intersection clipped strictly within authoritative Survey of India boundaries.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-400">&bull;</span>
                  <span><strong>Anomaly Z-Score Calculation:</strong> Departures evaluated against 30-year IMD gridded normals (1991–2020).</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-400">&bull;</span>
                  <span><strong>Ensemble Probability Density:</strong> Multi-model weighted consensus assessing hazard exceedance thresholds.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-400">&bull;</span>
                  <span><strong>Hydrological Runoff Coupling:</strong> Soil moisture saturation index combined with Digital Elevation Model (DEM) slopes.</span>
                </li>
              </ul>
            </div>

            {/* Column 3: Uncertainty & Limitations */}
            <div className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#d4dcff]">
                03 &bull; Scientific Uncertainty &amp; Limitations
              </div>
              <ul className="space-y-1.5 text-slate-300">
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-400">&bull;</span>
                  <span><strong>Satellite Parallax Effect:</strong> Geostationary optical viewing angle over northern mountainous terrain requires geometric orthorectification.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-400">&bull;</span>
                  <span><strong>Radar Beam Blockage:</strong> Isolated ground clutter and terrain shadowing may underestimate rain rates in high-relief topography.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-400">&bull;</span>
                  <span><strong>Lead-Time Uncertainty:</strong> Convective initiation location uncertainty widens beyond T+36 hours.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-400">&bull;</span>
                  <span><strong>Non-Statutory Status:</strong> AI synthesis serves research &amp; analytical support; statutory alerts remain under IMD/NDMA jurisdiction.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
