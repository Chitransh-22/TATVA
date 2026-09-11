import { useEffect, useRef } from 'react';
import { BarChart3, ShieldCheck, Database, Leaf, ArrowRight } from 'lucide-react';
import { TatvaLogo } from './TatvaLogo';
import heroRainBg from '../assets/images/hero_rain_bg_1789053375931.jpg';

export function HeroSection({ onExploreClick }) {
  const canvasRef = useRef(null);

  // Animated canvas rainfall simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };

    window.addEventListener('resize', handleResize);

    // Generate raindrops
    const rainCount = 140;
    const drops = [];
    for (let i = 0; i < rainCount; i++) {
      drops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        l: Math.random() * 22 + 10,
        xs: -1.2 + Math.random() * 0.4, // Slight wind angle
        ys: Math.random() * 12 + 15,
        opacity: Math.random() * 0.4 + 0.15,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < rainCount; i++) {
        const d = drops[i];
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x + d.l * (d.xs / d.ys), d.y + d.l);
        ctx.strokeStyle = `rgba(186, 220, 255, ${d.opacity})`;
        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';
        ctx.stroke();

        d.x += d.xs;
        d.y += d.ys;

        if (d.x < 0 || d.y > height) {
          d.x = Math.random() * (width + 50);
          d.y = -20;
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const featurePills = [
    {
      label: 'Real-Time Insights',
      icon: BarChart3,
      id: 'feature-realtime',
    },
    {
      label: 'Disaster Preparedness',
      icon: ShieldCheck,
      id: 'feature-disaster',
    },
    {
      label: 'Data-Driven Decisions',
      icon: Database,
      id: 'feature-datadriven',
    },
    {
      label: 'Sustainable Future',
      icon: Leaf,
      id: 'feature-sustainable',
    },
  ];

  return (
    <section
      id="hero-section"
      className="relative w-full min-h-screen flex flex-col justify-between overflow-hidden select-none"
    >
      {/* Background Image: Stormy Mountain & Cityscape */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroRainBg}
          alt="Stormy rain over Indian mountain ranges and illuminated monuments"
          className="w-full h-full object-cover object-center scale-105 transform animate-[pulse_8s_ease-in-out_infinite]"
          referrerPolicy="no-referrer"
        />
        {/* Deep atmospheric navy overlays for dramatic contrast matching image */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#060c1d]/75 via-[#081126]/60 to-[#070e20]/95" />
        <div className="absolute inset-0 bg-radial-[circle_at_50%_35%] from-blue-900/20 via-transparent to-[#040813]/85" />
      </div>

      {/* Dynamic Rain Overlay Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
      />

      {/* India Gate Silhouette & Golden Glow Accent (Right-Center Landscape) */}
      <div className="absolute bottom-16 right-12 md:right-28 lg:right-36 w-44 md:w-56 h-40 opacity-75 pointer-events-none z-10">
        <svg viewBox="0 0 160 140" className="w-full h-full">
          <defs>
            <radialGradient id="gateGlow" cx="50%" cy="60%" r="50%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#d97706" stopOpacity="0.2" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>
          <circle cx="80" cy="80" r="60" fill="url(#gateGlow)" />
          {/* India Gate Arch silhouette */}
          <path
            d="M 40 120 L 40 40 L 48 40 L 48 30 L 112 30 L 112 40 L 120 40 L 120 120 L 100 120 L 100 75 Q 100 60 80 60 Q 60 60 60 75 L 60 120 Z"
            fill="#111827"
            opacity="0.92"
          />
          <path
            d="M 60 75 Q 60 60 80 60 Q 100 60 100 75 L 100 120 L 60 120 Z"
            fill="#fbbf24"
            opacity="0.4"
          />
          <line x1="45" y1="36" x2="115" y2="36" stroke="#fbbf24" strokeWidth="1.5" opacity="0.7" />
        </svg>
      </div>

      {/* Top Bar Header Area inside Hero */}
      <div className="relative z-20 w-full px-6 pt-6 md:px-12 flex justify-end items-start">
        {/* Slogan at top right */}
        <div className="text-right flex flex-col items-end">
          <span className="text-sm md:text-base font-semibold text-slate-100 tracking-wide drop-shadow-md">
            A Weather Ready
          </span>
          <span className="text-sm md:text-base font-semibold text-slate-100 tracking-wide drop-shadow-md">
            and Resilient India
          </span>
          {/* Tricolor accent bar */}
          <div className="mt-1 flex h-1 w-20 rounded-full overflow-hidden shadow-sm">
            <div className="w-1/2 bg-amber-500" />
            <div className="w-1/2 bg-emerald-500" />
          </div>
        </div>
      </div>

      {/* Center Main Hero Block */}
      <div className="relative z-20 w-full max-w-4xl mx-auto px-4 py-8 flex flex-col items-center text-center">
        {/* Large TATVA Cloud Logo with droplet & leaf */}
        <div className="mb-3 transform hover:scale-105 transition-transform duration-300">
          <TatvaLogo size="hero" showText={false} />
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-[0.18em] text-white font-['Plus_Jakarta_Sans',sans-serif] uppercase drop-shadow-[0_4px_24px_rgba(37,99,235,0.45)]">
          TATVA
        </h1>

        {/* Subtitle */}
        <h2 className="mt-3 text-base sm:text-lg md:text-xl font-bold tracking-wide text-slate-100 drop-shadow-md">
          National Weather Big Data Analytics Platform
        </h2>

        {/* Tagline */}
        <p className="mt-2 text-xs sm:text-sm md:text-base text-slate-300 font-medium tracking-normal max-w-xl">
          Turning Weather Data into a Safer, Smarter Tomorrow
        </p>

        {/* 4 Feature Badges Row */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 md:gap-5 w-full max-w-2xl px-2">
          {featurePills.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.id}
                id={feature.id}
                className="flex flex-col items-center justify-center p-3 rounded-2xl bg-[#09142b]/65 hover:bg-[#0e1d3e]/85 backdrop-blur-md border border-white/10 transition-all duration-300 hover:-translate-y-1 hover:border-blue-500/40 shadow-lg cursor-default group"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600/25 border border-blue-500/30 flex items-center justify-center mb-2 text-blue-400 group-hover:text-blue-300 group-hover:bg-blue-600/40 transition-colors">
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] sm:text-xs font-semibold text-slate-200 text-center leading-tight tracking-tight">
                  {feature.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Explore Insights Button */}
        <div className="mt-8">
          <button
            id="hero-explore-btn"
            onClick={onExploreClick}
            className="group inline-flex items-center gap-2.5 px-8 py-3 rounded-full bg-gradient-to-r from-blue-600 via-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-sm tracking-wide shadow-[0_8px_25px_rgba(37,99,235,0.45)] hover:shadow-[0_10px_30px_rgba(37,99,235,0.6)] transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span>Explore Insights</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
          </button>
        </div>
      </div>

      {/* Bottom Row inside Hero */}
      <div className="relative z-20 w-full px-6 pb-6 md:px-12 flex justify-end items-end">
        <p className="text-slate-200/90 text-sm md:text-base font-serif italic tracking-wide drop-shadow-md text-right">
          “Data for a Safer, Stronger India.”
        </p>
      </div>
    </section>
  );
}
