export function Breadcrumbs({
  selectedState,
  selectedDistrict,
  onSelectIndia,
  onSelectState,
}) {
  return (
    <div className="floating-breadcrumbs" aria-label="Geographic Navigation Trail">
      <div className="breadcrumb-nav">
        {/* India Root */}
        <button
          type="button"
          className={`crumb-pill ${!selectedState ? 'current' : 'clickable'}`}
          onClick={onSelectIndia}
        >
          <span className="crumb-icon">🇮🇳</span>
          <span className="crumb-text">India</span>
        </button>

        {/* State Level */}
        {selectedState && (
          <>
            <span className="crumb-sep">/</span>
            <button
              type="button"
              className={`crumb-pill ${selectedState && !selectedDistrict ? 'current' : 'clickable'}`}
              onClick={() => onSelectState(selectedState)}
            >
              <span className="crumb-text">{selectedState}</span>
            </button>
          </>
        )}

        {/* District Level */}
        {selectedDistrict && (
          <>
            <span className="crumb-sep">/</span>
            <div className="crumb-pill current district-pill">
              <span className="crumb-text">{selectedDistrict}</span>
            </div>
          </>
        )}
      </div>

      <div className="breadcrumb-hint">
        {!selectedState && 'Click any state on the map to explore district rainfall'}
        {selectedState && !selectedDistrict && `Click any district in ${selectedState} to inspect observation points`}
        {selectedDistrict && `Showing observation points in ${selectedDistrict}`}
      </div>
    </div>
  );
}
