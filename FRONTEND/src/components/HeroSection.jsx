
import { useEffect, useRef } from 'react';
import {
  BarChart3,
  ShieldCheck,
  Database,
  Leaf,
  ArrowRight,
} from 'lucide-react';

import { TatvaLogo } from './TatvaLogo';
import { Hero3DScene } from './Hero3DScene';

import heroRainBg from '../assets/images/hero_rain_bg_1789053375931.jpg';

export function HeroSection({ onExploreClick }) {
  const canvasRef = useRef(null);
  const heroBgRef = useRef(null);

  /*
   * ============================================================
   * BACKGROUND IMAGE SCROLL ZOOM
   * ============================================================
   */

  useEffect(() => {
    const hero = document.getElementById('hero-section');

    if (!hero || !heroBgRef.current) {
      return undefined;
    }

    let animationFrameId = null;

    let currentProgress = 0;
    let targetProgress = 0;

    const updateScrollProgress = () => {
      const rect = hero.getBoundingClientRect();
      const heroHeight = hero.offsetHeight;

      if (heroHeight <= 0) {
        return;
      }

      targetProgress = -rect.top / heroHeight;

      targetProgress = Math.max(
        0,
        Math.min(1, targetProgress)
      );
    };

    const animateBackground = () => {
      currentProgress +=
        (targetProgress - currentProgress) * 0.08;

      /*
       * Background:
       * 1.05x → 1.35x
       */
      const scale =
        1.05 + currentProgress * 0.30;

      /*
       * Parallax movement.
       */
      const translateY =
        currentProgress * -50;

      if (heroBgRef.current) {
        heroBgRef.current.style.transform =
          `translate3d(0, ${translateY}px, 0) scale(${scale})`;
      }

      animationFrameId =
        requestAnimationFrame(animateBackground);
    };

    window.addEventListener(
      'scroll',
      updateScrollProgress,
      { passive: true }
    );

    window.addEventListener(
      'resize',
      updateScrollProgress
    );

    updateScrollProgress();
    animateBackground();

    return () => {
      window.removeEventListener(
        'scroll',
        updateScrollProgress
      );

      window.removeEventListener(
        'resize',
        updateScrollProgress
      );

      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, []);

  /*
   * ============================================================
   * RAIN ANIMATION
   * ============================================================
   */

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return undefined;
    }

    let animationFrameId;

    let width = canvas.offsetWidth;
    let height = canvas.offsetHeight;

    canvas.width = width;
    canvas.height = height;

    const handleResize = () => {
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;

      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener(
      'resize',
      handleResize
    );

    /*
     * Rain configuration.
     */
    const rainCount = 140;
    const drops = [];

    for (let i = 0; i < rainCount; i += 1) {
      drops.push({
        x: Math.random() * width,
        y: Math.random() * height,
        length: Math.random() * 22 + 10,
        wind: -1.2 + Math.random() * 0.4,
        speed: Math.random() * 12 + 15,
        opacity: Math.random() * 0.4 + 0.15,
      });
    }

    const drawRain = () => {
      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      for (let i = 0; i < drops.length; i += 1) {
        const drop = drops[i];

        ctx.beginPath();

        ctx.moveTo(
          drop.x,
          drop.y
        );

        ctx.lineTo(
          drop.x +
            drop.length *
              (drop.wind / drop.speed),
          drop.y + drop.length
        );

        ctx.strokeStyle =
          `rgba(186, 220, 255, ${drop.opacity})`;

        ctx.lineWidth = 1.2;
        ctx.lineCap = 'round';

        ctx.stroke();

        drop.x += drop.wind;
        drop.y += drop.speed;

        if (
          drop.y > height ||
          drop.x < -50
        ) {
          drop.x =
            Math.random() *
            (width + 50);

          drop.y = -30;
        }
      }

      animationFrameId =
        requestAnimationFrame(drawRain);
    };

    drawRain();

    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      );

      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  /*
   * ============================================================
   * FEATURES
   * ============================================================
   */

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

  /*
   * ============================================================
   * HERO
   * ============================================================
   */

  return (
    <section
      id="hero-section"
      className="
        relative
        w-full
        min-h-screen
        flex
        flex-col
        justify-between
        overflow-hidden
        select-none
        bg-[#eff6ff]
      "
    >
      {/* ========================================================
          CUSTOM ANIMATION CSS
          ======================================================== */}

      <style>
        {`
          /*
           * ======================================================
           * HEADER
           * ======================================================
           */

          @keyframes heroHeaderIn {
            0% {
              opacity: 0;
              transform: translateY(-35px);
            }

            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }


          /*
           * ======================================================
           * LOGO
           * ======================================================
           */

          @keyframes heroLogoIn {
            0% {
              opacity: 0;
              transform: scale(0.65);
              filter: blur(10px);
            }

            60% {
              opacity: 1;
              transform: scale(1.04);
            }

            100% {
              opacity: 1;
              transform: scale(1);
              filter: blur(0);
            }
          }


          /*
           * ======================================================
           * TITLE
           * ======================================================
           */

          @keyframes heroTitleIn {
            0% {
              opacity: 0;
              transform: translateY(-75px);
              filter: blur(5px);
            }

            100% {
              opacity: 1;
              transform: translateY(0);
              filter: blur(0);
            }
          }


          /*
           * ======================================================
           * SUBTITLE / TAGLINE
           * ======================================================
           */

          @keyframes heroRiseIn {
            0% {
              opacity: 0;
              transform: translateY(55px);
              filter: blur(4px);
            }

            100% {
              opacity: 1;
              transform: translateY(0);
              filter: blur(0);
            }
          }


          /*
           * ======================================================
           * FEATURE CARDS
           * ======================================================
           */

          @keyframes heroCardIn {
            0% {
              opacity: 0;
              transform:
                translateY(65px)
                scale(0.90);
            }

            55% {
              opacity: 1;
              transform:
                translateY(-7px)
                scale(1.025);
            }

            100% {
              opacity: 1;
              transform:
                translateY(0)
                scale(1);
            }
          }


          /*
           * ======================================================
           * BUTTON
           * ======================================================
           */

          @keyframes heroButtonIn {
            0% {
              opacity: 0;
              transform:
                translateY(45px)
                scale(0.78);
              filter: blur(4px);
            }

            55% {
              opacity: 1;
              transform:
                translateY(-7px)
                scale(1.05);
            }

            100% {
              opacity: 1;
              transform:
                translateY(0)
                scale(1);
              filter: blur(0);
            }
          }


          /*
           * ======================================================
           * BOTTOM SLOGAN
           * ======================================================
           */

          @keyframes heroBottomIn {
            0% {
              opacity: 0;
              transform: translateY(45px);
              filter: blur(4px);
            }

            100% {
              opacity: 1;
              transform: translateY(0);
              filter: blur(0);
            }
          }


          /*
           * ======================================================
           * ANIMATION CLASSES
           * ======================================================
           */

          .hero-header-animation {
            opacity: 0;

            animation-name: heroHeaderIn;
            animation-duration: 2000ms;
            animation-timing-function:
              cubic-bezier(0.16, 1, 0.3, 1);
            animation-delay: 300ms;
            animation-fill-mode: both;
          }


          .hero-logo-animation {
            opacity: 0;

            animation-name: heroLogoIn;
            animation-duration: 2000ms;
            animation-timing-function:
              cubic-bezier(0.16, 1, 0.3, 1);
            animation-delay: 700ms;
            animation-fill-mode: both;
          }


          .hero-title-animation {
            opacity: 0;

            animation-name: heroTitleIn;
            animation-duration: 2000ms;
            animation-timing-function:
              cubic-bezier(0.16, 1, 0.3, 1);
            animation-delay: 1100ms;
            animation-fill-mode: both;
          }


          .hero-rise-animation {
            opacity: 0;

            animation-name: heroRiseIn;
            animation-duration: 2000ms;
            animation-timing-function:
              cubic-bezier(0.16, 1, 0.3, 1);
            animation-fill-mode: both;
          }


          .hero-card-animation {
            opacity: 0;

            animation-name: heroCardIn;
            animation-duration: 2000ms;
            animation-timing-function:
              cubic-bezier(0.16, 1, 0.3, 1);
            animation-fill-mode: both;
          }


          .hero-button-animation {
            opacity: 0;

            animation-name: heroButtonIn;
            animation-duration: 2000ms;
            animation-timing-function:
              cubic-bezier(0.16, 1, 0.3, 1);
            animation-delay: 4200ms;
            animation-fill-mode: both;
          }


          .hero-bottom-animation {
            opacity: 0;

            animation-name: heroBottomIn;
            animation-duration: 2000ms;
            animation-timing-function:
              cubic-bezier(0.16, 1, 0.3, 1);
            animation-delay: 4700ms;
            animation-fill-mode: both;
          }


          /*
           * ======================================================
           * REDUCED MOTION
           * ======================================================
           */

          @media (prefers-reduced-motion: reduce) {
            .hero-header-animation,
            .hero-logo-animation,
            .hero-title-animation,
            .hero-rise-animation,
            .hero-card-animation,
            .hero-button-animation,
            .hero-bottom-animation {
              opacity: 1 !important;
              animation: none !important;
              transform: none !important;
              filter: none !important;
            }
          }
        `}
      </style>

      {/* ========================================================
          BACKGROUND IMAGE
          ======================================================== */}

      <div
        className="
          absolute
          inset-0
          z-0
          overflow-hidden
        "
      >
        <img
          ref={heroBgRef}
          src={heroRainBg}
          alt="Stormy rain over Indian mountain ranges and illuminated monuments"
          className="
            absolute
            inset-0
            w-full
            h-full
            object-cover
            object-center
            will-change-transform
          "
          style={{
            transform:
              'translate3d(0, 0, 0) scale(1.05)',
            transformOrigin:
              'center center',
          }}
          referrerPolicy="no-referrer"
        />

        {/* Atmospheric overlay */}

        <div
          className="
            absolute
            inset-0
            bg-gradient-to-b
            from-blue-950/10
            via-transparent
            to-[#eff6ff]/30
            pointer-events-none
          "
        />

        {/* Bottom blend */}

        <div
          className="
            absolute
            bottom-0
            left-0
            right-0
            h-48
            bg-gradient-to-b
            from-transparent
            via-[#dbeafe]/50
            to-[#eff6ff]
            pointer-events-none
          "
        />
      </div>

      {/* ========================================================
          3D SCENE
          ======================================================== */}

      <Hero3DScene />

      {/* ========================================================
          RAIN
          ======================================================== */}

      <canvas
        ref={canvasRef}
        className="
          absolute
          inset-0
          w-full
          h-full
          pointer-events-none
          z-10
        "
      />

      {/* ========================================================
          HEADER
          DELAY: 300ms
          ======================================================== */}

      <div
        className="
          relative
          z-30
          w-full
          px-6
          pt-6
          md:px-12
          flex
          justify-end
          items-start
          hero-header-animation
        "
      >
        <div
          className="
            text-right
            flex
            flex-col
            items-end
          "
        >
          <span
            className="
              text-sm
              md:text-base
              font-semibold
              text-slate-100
              tracking-wide
              drop-shadow-md
            "
          >
            A Weather Ready
          </span>

          <span
            className="
              text-sm
              md:text-base
              font-semibold
              text-slate-100
              tracking-wide
              drop-shadow-md
            "
          >
            and Resilient India
          </span>

          <div
            className="
              mt-1
              flex
              h-1
              w-20
              rounded-full
              overflow-hidden
              shadow-sm
            "
          >
            <div className="w-1/2 bg-amber-500" />
            <div className="w-1/2 bg-emerald-500" />
          </div>
        </div>
      </div>

      {/* ========================================================
          MAIN CONTENT
          ======================================================== */}

      <div
        className="
          relative
          z-30
          w-full
          max-w-4xl
          mx-auto
          px-4
          py-8
          flex
          flex-col
          items-center
          text-center
        "
      >
        {/* ======================================================
            LOGO
            DELAY: 700ms
            ====================================================== */}

        <div
          className="
            mb-3
            hero-logo-animation
          "
        >
          <TatvaLogo
            size="hero"
            showText={false}
          />
        </div>

        {/* ======================================================
            TITLE
            DELAY: 1100ms
            ====================================================== */}

        <h1
          className="
            text-4xl
            sm:text-5xl
            md:text-6xl
            lg:text-7xl
            font-black
            tracking-[0.18em]
            text-white
            font-['Plus_Jakarta_Sans',sans-serif]
            uppercase
            drop-shadow-[0_4px_24px_rgba(37,99,235,0.45)]
            hero-title-animation
          "
        >
          TATVA
        </h1>

        {/* ======================================================
            SUBTITLE
            DELAY: 1500ms
            ====================================================== */}

        <h2
          className="
            mt-3
            text-base
            sm:text-lg
            md:text-xl
            font-bold
            tracking-wide
            text-slate-100
            drop-shadow-md
            hero-rise-animation
          "
          style={{
            animationDelay: '1500ms',
          }}
        >
          National Weather Big Data Analytics Platform
        </h2>

        {/* ======================================================
            TAGLINE
            DELAY: 1900ms
            ====================================================== */}

        <p
          className="
            mt-2
            text-xs
            sm:text-sm
            md:text-base
            text-slate-300
            font-medium
            tracking-normal
            max-w-xl
            hero-rise-animation
          "
          style={{
            animationDelay: '1900ms',
          }}
        >
          Turning Weather Data into a Safer,
          Smarter Tomorrow
        </p>

        {/* ======================================================
            FEATURE CARDS
            ====================================================== */}

        <div
          className="
            mt-8
            grid
            grid-cols-2
            sm:grid-cols-4
            gap-3
            sm:gap-4
            md:gap-5
            w-full
            max-w-2xl
            px-2
          "
        >
          {featurePills.map(
            (feature, index) => {
              const Icon =
                feature.icon;

              /*
               * 2400
               * 2800
               * 3200
               * 3600
               */
              const animationDelay =
                2400 +
                index * 400;

              return (
                <div
                  key={feature.id}
                  id={feature.id}
                  className="
                    flex
                    flex-col
                    items-center
                    justify-center
                    p-3
                    rounded-2xl
                    bg-[#09142b]/65
                    hover:bg-[#0e1d3e]/85
                    backdrop-blur-md
                    border
                    border-white/10
                    transition-all
                    duration-300
                    hover:-translate-y-1
                    hover:border-blue-500/40
                    shadow-lg
                    cursor-default
                    group
                    hero-card-animation
                  "
                  style={{
                    animationDelay:
                      `${animationDelay}ms`,
                  }}
                >
                  <div
                    className="
                      w-10
                      h-10
                      rounded-xl
                      bg-blue-600/25
                      border
                      border-blue-500/30
                      flex
                      items-center
                      justify-center
                      mb-2
                      text-blue-400
                      group-hover:text-blue-300
                      group-hover:bg-blue-600/40
                      transition-colors
                    "
                  >
                    <Icon
                      className="w-5 h-5"
                    />
                  </div>

                  <span
                    className="
                      text-[11px]
                      sm:text-xs
                      font-semibold
                      text-slate-200
                      text-center
                      leading-tight
                      tracking-tight
                    "
                  >
                    {feature.label}
                  </span>
                </div>
              );
            }
          )}
        </div>

        {/* ======================================================
            CTA
            DELAY: 4200ms
            ====================================================== */}

        <div
          className="
            mt-8
            hero-button-animation
          "
        >
          <button
            id="hero-explore-btn"
            onClick={onExploreClick}
            className="
              group
              inline-flex
              items-center
              gap-2.5
              px-8
              py-3
              rounded-full
              bg-gradient-to-r
              from-blue-600
              via-blue-600
              to-blue-500
              hover:from-blue-500
              hover:to-blue-600
              text-white
              font-semibold
              text-sm
              tracking-wide
              shadow-[0_8px_25px_rgba(37,99,235,0.45)]
              hover:shadow-[0_10px_30px_rgba(37,99,235,0.6)]
              transition-all
              duration-300
              transform
              hover:-translate-y-0.5
              active:translate-y-0
            "
          >
            <span>
              Explore Insights
            </span>

            <ArrowRight
              className="
                w-4
                h-4
                transition-transform
                duration-300
                group-hover:translate-x-1
              "
            />
          </button>
        </div>
      </div>

      {/* ========================================================
          BOTTOM SLOGAN
          DELAY: 4700ms
          ======================================================== */}

      <div
        className="
          relative
          z-30
          w-full
          px-6
          pb-6
          md:px-12
          flex
          justify-end
          items-end
          hero-bottom-animation
        "
      >
        <p
          className="
            text-slate-800/90
            text-sm
            md:text-base
            font-serif
            italic
            tracking-wide
            drop-shadow-sm
            text-right
          "
        >
          “Data for a Safer,
          Stronger India.”
        </p>
      </div>
    </section>
  );
}
