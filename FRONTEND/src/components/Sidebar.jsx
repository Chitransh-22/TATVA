import { useState } from 'react';
import { BarChart3, AlertTriangle, Settings, User, Menu, X } from 'lucide-react';
import { TatvaLogo } from './TatvaLogo';

export function Sidebar({
  activeTab,
  onSelectTab,
  onOpenIncidentReport,
  onOpenAuthModal,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    {
      id: 'analysis',
      label: 'Analysis',
      icon: BarChart3,
      onClick: () => {
        onSelectTab('analysis');
        setMobileMenuOpen(false);
        const el = document.getElementById('analysis-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      },
    },
    {
      id: 'incident',
      label: 'Incident Report',
      icon: AlertTriangle,
      onClick: () => {
        onOpenIncidentReport();
        setMobileMenuOpen(false);
      },
    },
    {
      id: 'how-it-works',
      label: 'How It Works',
      icon: Settings,
      onClick: () => {
        onSelectTab('how-it-works');
        setMobileMenuOpen(false);
        const el = document.getElementById('how-it-works-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      },
    },
  ];

  return (
    <>
      {/* Mobile Top Header (only on small screens) */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-[#081023]/95 backdrop-blur-md border-b border-blue-900/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TatvaLogo size="sm" showText={true} />
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-200 hover:text-white rounded-lg bg-slate-800/60"
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-[60px] z-40 bg-[#081023]/95 backdrop-blur-xl p-6 flex flex-col justify-between">
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={item.onClick}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium text-sm transition-all duration-200 text-left ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-6 border-t border-slate-800">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAuthModal();
              }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/50 text-sm font-medium"
            >
              <User className="w-5 h-5" />
              <span>Login / Signup</span>
            </button>
          </div>
        </div>
      )}

      {/* Desktop Sticky Left Sidebar */}
      <aside className="hidden lg:flex flex-col justify-between w-[220px] shrink-0 sticky top-0 h-screen bg-[#070e1f] border-r border-blue-900/30 z-40 select-none shadow-2xl">
        {/* Top: Logo & Main Navigation */}
        <div className="pt-8 px-4 flex flex-col">
          {/* Logo */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="cursor-pointer mb-8 pb-4 flex flex-col items-center hover:opacity-95 transition-opacity"
          >
            <TatvaLogo size="md" showText={true} />
          </div>

          {/* Navigation Items */}
          <nav className="flex flex-col gap-2.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`sidebar-nav-${item.id}`}
                  onClick={item.onClick}
                  className={`group relative flex items-center gap-3.5 px-4 py-3 rounded-xl font-semibold text-xs tracking-wide transition-all duration-200 text-left ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/50'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-transform duration-200 group-hover:scale-110 ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                    }`}
                  />
                  <span>{item.label}</span>

                  {isActive && (
                    <span className="absolute right-2 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom: Mountain Silhouette & Login / Signup */}
        <div className="relative mt-auto flex flex-col overflow-hidden">
          {/* Stylized Mountain Silhouette at bottom */}
          <div className="h-28 w-full relative opacity-65 pointer-events-none">
            <svg
              viewBox="0 0 240 120"
              preserveAspectRatio="none"
              className="w-full h-full text-blue-950/70 fill-current"
            >
              <defs>
                <linearGradient id="mtnGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#070e1f" stopOpacity="0.9" />
                </linearGradient>
              </defs>
              {/* Back mountain peaks */}
              <polygon
                points="0,120 40,65 90,85 150,40 210,80 240,60 240,120"
                fill="url(#mtnGrad)"
              />
              {/* Front sharper mountain peaks */}
              <polygon
                points="0,120 20,80 75,50 130,95 185,60 240,90 240,120"
                fill="#0d1b38"
                opacity="0.9"
              />
              <path
                d="M 75 50 L 70 65 L 85 70 Z"
                fill="#93c5fd"
                opacity="0.3"
              />
              <path
                d="M 185 60 L 180 75 L 195 80 Z"
                fill="#93c5fd"
                opacity="0.25"
              />
            </svg>
          </div>

          {/* Divider line */}
          <div className="border-t border-slate-800/80 mx-3 mb-2" />

          {/* Login / Signup */}
          <div className="px-3 pb-6">
            <button
              id="sidebar-login-btn"
              onClick={onOpenAuthModal}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/60 text-xs font-semibold tracking-wide transition-colors"
            >
              <User className="w-4 h-4 text-slate-400" />
              <span>Login / Signup</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
