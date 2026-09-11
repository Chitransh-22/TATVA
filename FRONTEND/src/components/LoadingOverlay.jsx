export function LoadingOverlay({ isLoading, message }) {
  if (!isLoading) return null;

  return (
    <div className="loading-badge-indicator" role="status">
      <div className="spinner-ring"></div>
      <span className="loading-text">{message || 'Fetching PostGIS observations...'}</span>
    </div>
  );
}
