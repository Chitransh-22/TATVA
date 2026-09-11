import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`[ErrorBoundary - ${this.props.name || 'Component'}] Caught error:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="bg-slate-900/90 border border-slate-700/60 rounded-2xl p-6 my-4 text-center max-w-xl mx-auto shadow-xl backdrop-blur-md">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-100 mb-2">
            {this.props.title || 'Component Display Issue'}
          </h3>
          <p className="text-sm text-slate-400 mb-4 max-w-md mx-auto">
            {this.props.message || 'An error occurred while displaying this section. The rest of TATVA is active.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-all cursor-pointer shadow-md active:scale-95"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Section</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
