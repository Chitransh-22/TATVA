import { useState } from 'react';
import { Layers, Activity, AlertCircle, CheckCircle2, ChevronDown, Sparkles } from 'lucide-react';
import { MOSDAC_PRODUCTS } from '../data/mosdacProducts';

export function MosdacProductSelector({
  activeProductId,
  onSelectProduct,
  productStatusMap = {},
  compact = false,
}) {
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'weather' | 'environment' | 'ocean'
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const categories = [
    { id: 'all', label: 'All Products', count: 9 },
    { id: 'weather', label: 'Weather', icon: '🌦️', count: 6 },
    { id: 'environment', label: 'Environment', icon: '🌿', count: 2 },
    { id: 'ocean', label: 'Ocean', icon: '🌊', count: 1 },
  ];

  // Only display active, validated products on the main frontend (remove offline maps)
  const allProductList = Object.values(MOSDAC_PRODUCTS).filter(
    (p) => p.status !== 'UNAVAILABLE'
  );
  const filteredProducts = allProductList.filter((p) => {
    if (activeCategory === 'all') return true;
    return p.category === activeCategory;
  });

  const activeProduct = MOSDAC_PRODUCTS[activeProductId] || MOSDAC_PRODUCTS['3SIMG_L2B_HEM'];

  if (compact) {
    // Compact dropdown mode for the Map top toolbar
    return (
      <div className="relative inline-block text-left z-30">
        <button
          type="button"
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-800 shadow-2xs hover:bg-slate-50 transition-all cursor-pointer"
          title="Switch Active Satellite Layer"
        >
          <span className="text-sm">{activeProduct.icon}</span>
          <span className="font-bold text-slate-900">{activeProduct.shortName}</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 mt-1.5 w-72 rounded-2xl bg-white shadow-2xl border border-slate-100 py-2 z-30 animate-in fade-in zoom-in-95 duration-100">
            <div className="px-3 pb-2 mb-1 border-b border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                MOSDAC Satellite Layers
              </span>
              <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">
                INSAT-3DS
              </span>
            </div>

            <div className="max-h-72 overflow-y-auto px-1 space-y-0.5">
              {allProductList.map((prod) => {
                const isSelected = prod.productId === activeProductId;
                const isUnavailable = prod.status === 'UNAVAILABLE';
                const statusLabel = productStatusMap[prod.productId] || prod.status;

                return (
                  <button
                    key={prod.productId}
                    data-product-id={prod.productId}
                    type="button"
                    disabled={isUnavailable}
                    onClick={() => {
                      if (!isUnavailable) {
                        onSelectProduct(prod.productId);
                        setDropdownOpen(false);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs font-semibold'
                        : isUnavailable
                        ? 'opacity-45 cursor-not-allowed bg-slate-50/50 text-slate-400'
                        : 'hover:bg-blue-50 text-slate-700 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="text-base shrink-0">{prod.icon}</span>
                      <div className="min-w-0">
                        <div className="text-xs truncate font-medium">
                          {prod.shortName}
                        </div>
                        <div className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                          {prod.unit ? `${prod.unit} • ` : ''}{prod.category}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      {isUnavailable ? (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-400">
                          Unavailable
                        </span>
                      ) : statusLabel === 'LIVE DATA' ? (
                        <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live
                        </span>
                      ) : (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${isSelected ? 'bg-white/20 text-white' : 'bg-amber-50 text-amber-700'}`}>
                          Snapshot
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full interactive filter bar mode
  return (
    <div className="mosdac-selector-container w-full bg-white/90 backdrop-blur-md rounded-2xl p-3 sm:p-4 border border-slate-200/90 shadow-sm mb-4">
      {/* Top Header: Title & Category Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                MOSDAC Satellite Products
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                9 Live Products
              </span>
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeCategory === cat.id
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              {cat.icon ? `${cat.icon} ` : ''}
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Products Chips Scrollable Row */}
      <div className="pt-3 flex flex-wrap gap-2 items-center">
        {filteredProducts.map((prod) => {
          const isSelected = prod.productId === activeProductId;
          const isUnavailable = prod.status === 'UNAVAILABLE';
          const dynamicStatus = productStatusMap[prod.productId] || prod.status;

          return (
            <button
              key={prod.productId}
              data-product-id={prod.productId}
              type="button"
              disabled={isUnavailable}
              onClick={() => onSelectProduct(prod.productId)}
              title={
                isUnavailable
                  ? `${prod.productName}: ${prod.unavailabilityReason || 'Currently unavailable from upstream ISRO feed'}`
                  : `${prod.productName} • ${prod.unit} • ${prod.meta}`
              }
              className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isSelected
                  ? 'bg-blue-600 border-blue-600 text-white shadow-sm ring-2 ring-blue-500/20'
                  : isUnavailable
                  ? 'bg-slate-50 border-slate-200/60 text-slate-400 opacity-60 cursor-not-allowed hover:bg-slate-50'
                  : 'bg-white border-slate-200 hover:border-blue-300 text-slate-700 hover:bg-blue-50/50'
              }`}
            >
              <span className="text-sm shrink-0">{prod.icon}</span>
              <span className="truncate max-w-[130px] sm:max-w-none">{prod.shortName}</span>

              {/* Status Badge Indicator */}
              <span className="shrink-0 ml-0.5">
                {isUnavailable ? (
                  <span className="text-[9px] font-bold uppercase px-1 py-0.2 rounded bg-slate-200/80 text-slate-500">
                    Offline
                  </span>
                ) : dynamicStatus === 'LIVE DATA' ? (
                  <span
                    className={`w-2 h-2 rounded-full inline-block ${
                      isSelected ? 'bg-emerald-300 animate-pulse' : 'bg-emerald-500 animate-pulse'
                    }`}
                    title="Real-time Live Ingestion Verified"
                  />
                ) : (
                  <span
                    className={`w-2 h-2 rounded-full inline-block ${
                      isSelected ? 'bg-amber-300' : 'bg-amber-400'
                    }`}
                    title="Last Available Snapshot"
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
