interface TatvaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showText?: boolean;
  className?: string;
}

export function TatvaLogo({ size = 'md', showText = true, className = '' }: TatvaLogoProps) {
  const iconSizes = {
    sm: 'w-8 h-8',
    md: 'w-11 h-11',
    lg: 'w-16 h-16',
    hero: 'w-24 h-24 md:w-28 md:h-28',
  };

  const textSizes = {
    sm: 'text-lg tracking-wider',
    md: 'text-2xl tracking-widest',
    lg: 'text-3xl tracking-widest',
    hero: 'text-5xl md:text-6xl tracking-[0.2em]',
  };

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      {/* Cloud + Leaf + Rain SVG */}
      <div className={`relative ${iconSizes[size]} transition-transform duration-300 hover:scale-105`}>
        <svg viewBox="0 0 120 100" className="w-full h-full drop-shadow-[0_8px_16px_rgba(37,99,235,0.4)]">
          <defs>
            {/* Cloud radial & linear gradients */}
            <linearGradient id="cloudGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="60%" stopColor="#dbeafe" />
              <stop offset="100%" stopColor="#93c5fd" />
            </linearGradient>
            <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4ade80" />
              <stop offset="100%" stopColor="#16a34a" />
            </linearGradient>
            <linearGradient id="dropGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Cloud body */}
          <path
            d="M 35 60 A 18 18 0 0 1 25 35 A 25 25 0 0 1 65 20 A 28 28 0 0 1 95 38 A 18 18 0 0 1 88 60 Z"
            fill="url(#cloudGrad)"
            filter="url(#glow)"
          />
          {/* Cloud highlight / 3D gloss curve */}
          <path
            d="M 38 48 A 12 12 0 0 1 62 25 A 20 20 0 0 1 82 35"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3.5"
            strokeLinecap="round"
            opacity="0.85"
          />

          {/* Falling raindrops */}
          <path
            d="M 38 68 Q 36 78 38 82 Q 41 82 40 70 Z"
            fill="url(#dropGrad)"
            className="animate-pulse"
          />
          <path
            d="M 54 69 Q 52 83 55 88 Q 58 88 56 71 Z"
            fill="url(#dropGrad)"
            className="animate-pulse"
            style={{ animationDelay: '0.2s' }}
          />
          <path
            d="M 68 67 Q 66 77 68 81 Q 71 81 70 69 Z"
            fill="url(#dropGrad)"
            className="animate-pulse"
            style={{ animationDelay: '0.4s' }}
          />

          {/* Leaf / Eco element at bottom right */}
          <g transform="translate(72, 45) rotate(15)">
            <path
              d="M 0 0 C 12 -8 24 4 22 20 C 10 22 0 14 0 0 Z"
              fill="url(#leafGrad)"
              stroke="#22c55e"
              strokeWidth="1.2"
              filter="drop-shadow(0 2px 4px rgba(22,163,74,0.5))"
            />
            {/* Leaf central vein */}
            <path
              d="M 2 2 C 10 7 16 12 20 18"
              fill="none"
              stroke="#bbf7d0"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>

      {showText && (
        <span
          className={`font-black uppercase text-white font-['Plus_Jakarta_Sans',sans-serif] mt-1.5 drop-shadow-[0_2px_10px_rgba(255,255,255,0.25)] ${textSizes[size]}`}
        >
          TATVA
        </span>
      )}
    </div>
  );
}
