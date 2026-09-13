import { useState } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import {
  getProductColor,
  getProductCategoryDesc,
  getProductRgb,
  getProductDefinition,
  DEFAULT_PRODUCT_ID,
} from '../data/mosdacProducts';
import {
  getRainfallColor,
  getCategoryBadgeStyle,
  getPrecipitationRgb,
} from '../utils/rainfallMetrics';

export {
  getRainfallColor,
  getCategoryBadgeStyle,
  getPrecipitationRgb,
  getProductColor,
  getProductCategoryDesc,
  getProductRgb,
};

export const getPrecipitationColor = getRainfallColor;

export function Legend({ productConfig, activeProductId }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const config = productConfig || getProductDefinition(activeProductId || DEFAULT_PRODUCT_ID);
  const colorScale = config?.colorScale || [];
  const isCategorical = config?.renderType === 'categorical_mask' || config?.productId?.includes('FOG');

  // Build CSS linear gradient for continuous scales
  const gradientStops = colorScale.length > 0
    ? [...colorScale].reverse().map((step, idx) => {
        const pct = Math.round((idx / Math.max(1, colorScale.length - 1)) * 100);
        return `${step.color} ${pct}%`;
      }).join(', ')
    : '#0284c7 0%, #38bdf8 100%';

  return (
    <div
      className="map-legend"
      role="region"
      aria-label={`${config?.productName || 'Product'} Legend`}
      style={{
        width: isExpanded ? '260px' : '230px',
        transition: 'all 0.2s ease-in-out',
      }}
    >
      {/* Legend Header */}
      <div className="legend-header">
        <div className="flex items-center gap-1.5 min-w-0 pr-1">
          <span className="text-xs">{config?.icon || '🛰️'}</span>
          <span className="legend-title truncate text-[11px]" title={config?.legendTitle || config?.productName}>
            {config?.legendTitle || config?.shortName || config?.productName}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="legend-unit">
            {config?.unit ? `(${config.unit})` : ''}
          </span>
          {colorScale.length > 0 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-slate-400 hover:text-slate-700 transition-colors p-0.5 rounded cursor-pointer"
              title={isExpanded ? 'Collapse Legend' : 'Expand Legend'}
              aria-label={isExpanded ? 'Collapse Legend' : 'Expand Legend'}
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Categorical Mode (e.g. FOG) */}
      {isCategorical ? (
        <div className="flex flex-col gap-1.5 mt-1.5">
          {colorScale.map((step) => (
            <div key={step.label} className="flex items-center justify-between text-[10px] text-slate-700">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-xs border border-slate-300"
                  style={{ backgroundColor: step.color }}
                />
                <span className="font-medium">{step.label}</span>
              </div>
              <span className="font-mono text-slate-500 font-semibold">{step.range}</span>
            </div>
          ))}
        </div>
      ) : (
        /* Continuous Mode (HEM, IMR, UTH, OLR, SST, SNW, AOD, CTP) */
        <div className="mt-1">
          {/* Continuous Gradient Track */}
          <div className="legend-bar-track">
            <div
              className="legend-gradient-bar"
              style={{
                background: `linear-gradient(to right, ${gradientStops})`,
              }}
            />
          </div>

          {/* Min and Max Range Ticks */}
          {colorScale.length > 0 && (
            <div className="legend-ticks">
              <span>{colorScale[colorScale.length - 1]?.min ?? 0}</span>
              {colorScale.length > 2 && (
                <span>{colorScale[Math.floor(colorScale.length / 2)]?.min}</span>
              )}
              <span>{colorScale[0]?.min}+</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded Multi-Step Breakdown Table */}
      {isExpanded && !isCategorical && colorScale.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5">
          {colorScale.map((step, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-[10px] text-slate-700 py-0.5"
            >
              <div className="flex items-center gap-1.5 min-w-0 pr-1">
                <span
                  className="w-2.5 h-2.5 rounded-xs shrink-0 border border-black/10"
                  style={{ backgroundColor: step.color }}
                />
                <span className="truncate text-slate-600 font-medium" title={step.label}>
                  {step.label}
                </span>
              </div>
              <span className="font-mono text-slate-500 font-semibold shrink-0 text-[9.5px]">
                {step.range || `≥ ${step.min}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
