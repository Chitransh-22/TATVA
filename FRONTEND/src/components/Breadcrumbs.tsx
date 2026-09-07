import React from 'react';

interface BreadcrumbsProps {
  selectedState: string | null;
  selectedDistrict: string | null;
  onSelectIndia: () => void;
  onSelectState: (stateName: string) => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  selectedState,
  selectedDistrict,
  onSelectIndia,
  onSelectState,
}) => {
  return (
    <nav className="breadcrumbs-bar" aria-label="Geographic Breadcrumbs">
      <div className="breadcrumb-trail">
        <button
          type="button"
          className={`breadcrumb-item ${!selectedState ? 'active' : 'clickable'}`}
          onClick={onSelectIndia}
        >
          <span className="icon">🇮🇳</span> India
        </button>

        {selectedState && (
          <>
            <span className="breadcrumb-separator">/</span>
            <button
              type="button"
              className={`breadcrumb-item ${selectedState && !selectedDistrict ? 'active' : 'clickable'}`}
              onClick={() => onSelectState(selectedState)}
            >
              {selectedState}
            </button>
          </>
        )}

        {selectedDistrict && (
          <>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-item active">
              {selectedDistrict}
            </span>
          </>
        )}
      </div>

      <div className="breadcrumb-hint">
        {!selectedState && "Click any state polygon on the map to inspect district rainfall"}
        {selectedState && !selectedDistrict && `Showing districts in ${selectedState} • Click a district to view detailed observations`}
        {selectedDistrict && `Showing observation points in ${selectedDistrict} • Click breadcrumbs to return`}
      </div>
    </nav>
  );
};
