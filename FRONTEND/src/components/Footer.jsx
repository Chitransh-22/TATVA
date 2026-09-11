import { TatvaLogo } from './TatvaLogo';

export function Footer({ onSelectNav, onOpenIncidentReport }) {
  return (
    <footer className="w-full bg-[#070e20] text-slate-400 relative overflow-hidden select-none">
      {/* Top Wave Curve Edge */}
      <div className="w-full h-12 overflow-hidden leading-none rotate-180">
        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="relative block w-full h-12 text-[#eef4fc] fill-current"
        >
          <path d="M0,0 C150,90 350,-40 500,50 C650,140 900,10 1200,40 L1200,120 L0,120 Z" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-10 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10 pb-10 border-b border-slate-800/80">
          {/* Column 1: TATVA Brand Info (4 cols) */}
          <div className="lg:col-span-4 flex flex-col items-start">
            <div className="flex items-center gap-3 mb-3">
              <TatvaLogo size="sm" showText={false} />
              <span className="text-xl font-black tracking-widest text-white uppercase font-['Plus_Jakarta_Sans',sans-serif]">
                TATVA
              </span>
            </div>
            <p className="text-xs text-slate-300 font-medium leading-relaxed max-w-xs">
              National Weather Big Data Analytics Platform
            </p>
            <p className="text-xs text-slate-400 italic mt-1">
              Data for a Safer, Stronger India.
            </p>
          </div>

          {/* Column 2: Quick Links (2 cols) */}
          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3.5">
              Quick Links
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => {
                    onSelectNav('analysis');
                    document.getElementById('analysis-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="hover:text-blue-400 transition-colors"
                >
                  Analysis
                </button>
              </li>
              <li>
                <button
                  onClick={onOpenIncidentReport}
                  className="hover:text-blue-400 transition-colors"
                >
                  Incident Report
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onSelectNav('how-it-works');
                    document.getElementById('how-it-works-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="hover:text-blue-400 transition-colors"
                >
                  How It Works
                </button>
              </li>
            </ul>
          </div>

          {/* Column 3: Support (2 cols) */}
          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3.5">
              Support
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a href="#faqs" className="hover:text-blue-400 transition-colors">
                  FAQs
                </a>
              </li>
              <li>
                <a href="#contact" className="hover:text-blue-400 transition-colors">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#feedback" className="hover:text-blue-400 transition-colors">
                  Feedback
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Follow Us (2 cols) */}
          <div className="lg:col-span-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-3.5">
              Follow Us
            </h4>
            <div className="flex items-center gap-3">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-blue-600 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                aria-label="LinkedIn"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                </svg>
              </a>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-blue-500 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Twitter"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-red-600 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                aria-label="YouTube"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </a>
              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                aria-label="GitHub"
              >
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Column 5: Bharat Resilient Emblem (2 cols) */}
          <div className="lg:col-span-2 flex flex-col items-start lg:items-end justify-center">
            <div className="text-left lg:text-right">
              <span className="text-xs font-semibold text-slate-300 tracking-wide block">
                Together for a
              </span>
              <span className="text-xs font-bold text-slate-100 tracking-wide block">
                Weather Resilient Bharat
              </span>
              {/* Saffron & Green Accent Lines */}
              <div className="mt-1.5 flex h-1 w-24 lg:ml-auto rounded-full overflow-hidden">
                <div className="w-1/2 bg-amber-500" />
                <div className="w-1/2 bg-emerald-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legal / Copyright Bar */}
        <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div>© 2026 TATVA. All rights reserved.</div>
          <div className="flex items-center gap-4">
            <a href="#privacy" className="hover:text-slate-300 transition-colors">
              Privacy Policy
            </a>
            <span>|</span>
            <a href="#terms" className="hover:text-slate-300 transition-colors">
              Terms of Use
            </a>
            <span>|</span>
            <a href="#accessibility" className="hover:text-slate-300 transition-colors">
              Accessibility
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
