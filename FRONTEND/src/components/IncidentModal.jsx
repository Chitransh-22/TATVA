import { useState } from 'react';
import { AlertTriangle, Send, CheckCircle2, MapPin, Camera, X } from 'lucide-react';
import { INDIA_STATES_DATA } from '../data/weatherData';

export function IncidentModal({ isOpen, onClose }) {
  const [submitted, setSubmitted] = useState(false);
  const [incidentType, setIncidentType] = useState('flash_flood');
  const [selectedState, setSelectedState] = useState('Uttarakhand');
  const [district, setDistrict] = useState('Chamoli');
  const [severity, setSeverity] = useState('severe');
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      onClose();
    }, 2200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 relative animate-in fade-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="py-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">Incident Reported</h3>
            <p className="text-xs text-slate-600 mt-2 max-w-xs">
              Thank you. The report has been transmitted to TATVA Disaster Ingestion Pipeline & District SDMA.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Report Weather Incident</h3>
                <p className="text-xs text-slate-500">
                  Notify meteorological monitoring units of extreme localized conditions
                </p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Incident Type
                </label>
                <select
                  value={incidentType}
                  onChange={(e) => setIncidentType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="flash_flood">Flash Flood / Cloudburst</option>
                  <option value="heavy_waterlogging">Severe Urban Waterlogging</option>
                  <option value="landslide">Rain-induced Landslide</option>
                  <option value="dam_overflow">River / Reservoir Overflow</option>
                  <option value="cyclonic_wind">Gale Wind / Cyclonic Surge</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State</label>
                  <select
                    value={selectedState}
                    onChange={(e) => setSelectedState(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    {INDIA_STATES_DATA.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    District / Locality
                  </label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      placeholder="District name"
                      className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Severity Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {['moderate', 'severe', 'extreme'].map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverity(sev)}
                      className={`py-2 rounded-xl font-bold uppercase text-[10px] tracking-wider border transition-all ${
                        severity === sev
                          ? sev === 'extreme'
                            ? 'bg-red-600 text-white border-red-600'
                            : sev === 'severe'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-blue-600 text-white border-blue-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Description & Observations
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe rainfall rate, water depth, blocked transit arteries, or emergency evacuations..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-100 flex items-center justify-between text-blue-700">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4" />
                  <span>Attach Doppler photo / geotag</span>
                </div>
                <span className="text-[10px] uppercase font-bold text-blue-500">
                  Optional
                </span>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-600/30"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit to SDMA</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
