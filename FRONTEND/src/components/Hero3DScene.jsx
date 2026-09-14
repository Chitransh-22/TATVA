import { useEffect, useRef } from 'react';

export function Hero3DScene() {
  const sceneCanvasRef = useRef(null);
  const lightningCanvasRef = useRef(null);

  /* ============================================================
     ATMOSPHERIC PARTICLES + LIGHT STREAKS
     ============================================================ */

  useEffect(() => {
    const canvas = sceneCanvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return undefined;
    }

    let width = 0;
    let height = 0;

    let animationFrameId = null;

    let mouseX = 0;
    let mouseY = 0;

    const particles = [];
    const streaks = [];

    /* ============================================================
       GET CANVAS SIZE
       ============================================================ */

    const getSize = () => {
      const rect = canvas.getBoundingClientRect();

      return {
        width: Math.max(1, rect.width),
        height: Math.max(1, rect.height),
      };
    };

    /* ============================================================
       CREATE ATMOSPHERIC PARTICLES
       ============================================================ */

    const createParticles = () => {
      particles.length = 0;

      const particleCount = Math.min(
        75,
        Math.max(
          35,
          Math.floor(
            (width * height) / 22000
          )
        )
      );

      for (
        let i = 0;
        i < particleCount;
        i += 1
      ) {
        particles.push({
          x: Math.random() * width,

          y: Math.random() * height,

          size:
            Math.random() * 1.8 + 0.4,

          opacity:
            Math.random() * 0.22 + 0.035,

          depth:
            Math.random() * 0.8 + 0.2,

          drift:
            Math.random() * 0.18 - 0.09,

          speed:
            Math.random() * 0.18 + 0.04,

          phase:
            Math.random() *
            Math.PI *
            2,
        });
      }
    };

    /* ============================================================
       CREATE LIGHT STREAKS
       ============================================================ */

    const createStreaks = () => {
      streaks.length = 0;

      for (
        let i = 0;
        i < 5;
        i += 1
      ) {
        streaks.push({
          x:
            Math.random() *
            width,

          y:
            Math.random() *
            height *
            0.75,

          length:
            Math.random() *
              160 +
            80,

          speed:
            Math.random() *
              0.35 +
            0.15,

          opacity:
            Math.random() *
              0.035 +
            0.01,

          angle:
            -0.15 +
            Math.random() *
              0.08,
        });
      }
    };

    /* ============================================================
       RESIZE CANVAS
       ============================================================ */

    const resize = () => {
      const size = getSize();

      width = size.width;
      height = size.height;

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        2
      );

      canvas.width =
        width * dpr;

      canvas.height =
        height * dpr;

      canvas.style.width =
        `${width}px`;

      canvas.style.height =
        `${height}px`;

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );

      createParticles();
      createStreaks();
    };

    /* ============================================================
       MOUSE PARALLAX
       ============================================================ */

    const handleMouseMove = (event) => {
      mouseX =
        event.clientX /
          window.innerWidth -
        0.5;

      mouseY =
        event.clientY /
          window.innerHeight -
        0.5;
    };

    /* ============================================================
       DRAW PARTICLES
       ============================================================ */

    const drawParticles = (time) => {
      for (
        let i = 0;
        i < particles.length;
        i += 1
      ) {
        const particle =
          particles[i];

        const waveX =
          Math.sin(
            time * 0.00035 +
              particle.phase
          ) * 7;

        const waveY =
          Math.cos(
            time * 0.00025 +
              particle.phase
          ) * 5;

        const parallaxX =
          mouseX *
          15 *
          particle.depth;

        const parallaxY =
          mouseY *
          10 *
          particle.depth;

        const x =
          particle.x +
          waveX +
          parallaxX;

        const y =
          particle.y +
          waveY +
          parallaxY;

        const pulse =
          0.65 +
          Math.sin(
            time * 0.0015 +
              particle.phase
          ) *
            0.35;

        /* Main particle */

        ctx.beginPath();

        ctx.arc(
          x,
          y,
          particle.size,
          0,
          Math.PI * 2
        );

        ctx.fillStyle =
          `rgba(210, 232, 255, ${
            particle.opacity *
            pulse
          })`;

        ctx.fill();

        /* Very subtle glow */

        if (
          particle.size >
          1.2
        ) {
          ctx.beginPath();

          ctx.arc(
            x,
            y,
            particle.size * 2.8,
            0,
            Math.PI * 2
          );

          ctx.fillStyle =
            `rgba(190, 220, 255, ${
              particle.opacity *
              0.05 *
              pulse
            })`;

          ctx.fill();
        }

        /* Slow movement */

        particle.y +=
          particle.speed;

        particle.x +=
          particle.drift;

        if (
          particle.y >
          height + 10
        ) {
          particle.y = -10;

          particle.x =
            Math.random() *
            width;
        }

        if (
          particle.x <
          -10
        ) {
          particle.x =
            width + 10;
        }

        if (
          particle.x >
          width + 10
        ) {
          particle.x = -10;
        }
      }
    };

    /* ============================================================
       DRAW LIGHT STREAKS
       ============================================================ */

    const drawStreaks = () => {
      for (
        let i = 0;
        i < streaks.length;
        i += 1
      ) {
        const streak =
          streaks[i];

        const dx =
          Math.cos(
            streak.angle
          ) *
          streak.length;

        const dy =
          Math.sin(
            streak.angle
          ) *
          streak.length;

        const gradient =
          ctx.createLinearGradient(
            streak.x,
            streak.y,
            streak.x + dx,
            streak.y + dy
          );

        gradient.addColorStop(
          0,
          'rgba(220, 240, 255, 0)'
        );

        gradient.addColorStop(
          0.5,
          `rgba(220, 240, 255, ${streak.opacity})`
        );

        gradient.addColorStop(
          1,
          'rgba(220, 240, 255, 0)'
        );

        ctx.beginPath();

        ctx.moveTo(
          streak.x,
          streak.y
        );

        ctx.lineTo(
          streak.x + dx,
          streak.y + dy
        );

        ctx.strokeStyle =
          gradient;

        ctx.lineWidth = 1;

        ctx.stroke();

        streak.x +=
          streak.speed;

        if (
          streak.x >
          width +
            streak.length
        ) {
          streak.x =
            -streak.length;

          streak.y =
            Math.random() *
            height *
            0.75;
        }
      }
    };

    /* ============================================================
       MAIN ANIMATION
       ============================================================ */

    const animate = (time) => {
      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      drawStreaks();
      drawParticles(time);

      animationFrameId =
        requestAnimationFrame(
          animate
        );
    };

    resize();

    window.addEventListener(
      'resize',
      resize
    );

    window.addEventListener(
      'mousemove',
      handleMouseMove,
      { passive: true }
    );

    animationFrameId =
      requestAnimationFrame(
        animate
      );

    return () => {
      window.removeEventListener(
        'resize',
        resize
      );

      window.removeEventListener(
        'mousemove',
        handleMouseMove
      );

      if (
        animationFrameId !== null
      ) {
        cancelAnimationFrame(
          animationFrameId
        );
      }
    };
  }, []);

  /* ============================================================
     LIGHTNING SYSTEM
     ============================================================ */

  useEffect(() => {
    const canvas =
      lightningCanvasRef.current;

    if (!canvas) {
      return undefined;
    }

    const ctx =
      canvas.getContext('2d');

    if (!ctx) {
      return undefined;
    }

    let width = 0;
    let height = 0;

    let animationFrameId = null;
    let lightningTimeout = null;

    let flash = 0;

    let bolt = null;

    let branches = [];

    /* ============================================================
       RESIZE LIGHTNING CANVAS
       ============================================================ */

    const resize = () => {
      const rect =
        canvas.getBoundingClientRect();

      width = Math.max(
        1,
        rect.width
      );

      height = Math.max(
        1,
        rect.height
      );

      const dpr = Math.min(
        window.devicePixelRatio || 1,
        2
      );

      canvas.width =
        width * dpr;

      canvas.height =
        height * dpr;

      canvas.style.width =
        `${width}px`;

      canvas.style.height =
        `${height}px`;

      ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
      );
    };

    /* ============================================================
       CREATE LIGHTNING BOLT
       ============================================================ */

    const createBolt = () => {
      const points = [];

      /*
       * Start somewhere across the sky.
       */

      let x =
        width *
        (
          0.18 +
          Math.random() * 0.64
        );

      let y = -30;

      points.push({
        x,
        y,
      });

      /*
       * Lightning reaches somewhere
       * between 45% and 83% of the screen.
       */

      const targetHeight =
        height *
        (
          0.45 +
          Math.random() * 0.38
        );

      const segments =
        7 +
        Math.floor(
          Math.random() * 5
        );

      const segmentHeight =
        targetHeight /
        segments;

      for (
        let i = 0;
        i < segments;
        i += 1
      ) {
        /*
         * Random horizontal zig-zag.
         */

        const horizontalMovement =
          (
            Math.random() -
            0.5
          ) *
          (
            75 -
            i * 3
          );

        x +=
          horizontalMovement;

        y +=
          segmentHeight;

        points.push({
          x,
          y,
        });
      }

      return points;
    };

    /* ============================================================
       CREATE LIGHTNING BRANCHES
       ============================================================ */

    const createBranches = (
      mainBolt
    ) => {
      const result = [];

      /*
       * 1-3 branches.
       */

      const branchCount =
        1 +
        Math.floor(
          Math.random() * 3
        );

      for (
        let i = 0;
        i < branchCount;
        i += 1
      ) {
        if (
          mainBolt.length <
          4
        ) {
          continue;
        }

        const startIndex =
          2 +
          Math.floor(
            Math.random() *
              (
                mainBolt.length -
                3
              )
          );

        const start =
          mainBolt[startIndex];

        const points = [
          {
            x: start.x,
            y: start.y,
          },
        ];

        let x = start.x;
        let y = start.y;

        const direction =
          Math.random() >
          0.5
            ? 1
            : -1;

        const branchLength =
          2 +
          Math.floor(
            Math.random() * 3
          );

        for (
          let j = 0;
          j < branchLength;
          j += 1
        ) {
          x +=
            direction *
            (
              18 +
              Math.random() * 28
            );

          y +=
            18 +
            Math.random() * 30;

          points.push({
            x,
            y,
          });
        }

        result.push(points);
      }

      return result;
    };

    /* ============================================================
       DRAW LIGHTNING PATH
       ============================================================ */

    const drawPath = (
      points,
      opacity,
      lineWidth
    ) => {
      if (
        !points ||
        points.length < 2
      ) {
        return;
      }

      ctx.beginPath();

      ctx.moveTo(
        points[0].x,
        points[0].y
      );

      for (
        let i = 1;
        i < points.length;
        i += 1
      ) {
        ctx.lineTo(
          points[i].x,
          points[i].y
        );
      }

      ctx.strokeStyle =
        `rgba(225, 242, 255, ${opacity})`;

      ctx.lineWidth =
        lineWidth;

      ctx.lineCap =
        'round';

      ctx.lineJoin =
        'round';

      ctx.stroke();
    };

    /* ============================================================
       LIGHTNING RENDER LOOP
       ============================================================ */

    const drawLightning = () => {
      ctx.clearRect(
        0,
        0,
        width,
        height
      );

      /*
       * Nothing to render.
       */

      if (flash <= 0) {
        animationFrameId =
          requestAnimationFrame(
            drawLightning
          );

        return;
      }

      /*
       * Very subtle atmospheric
       * illumination.
       *
       * Keeps TATVA readable.
       */

      ctx.fillStyle =
        `rgba(225, 240, 255, ${
          flash * 0.07
        })`;

      ctx.fillRect(
        0,
        0,
        width,
        height
      );

      if (bolt) {
        ctx.save();

        /*
         * Large lightning glow.
         */

        ctx.shadowBlur = 32;

        ctx.shadowColor =
          `rgba(190, 225, 255, ${
            flash * 0.8
          })`;

        /*
         * Main bolt.
         */

        drawPath(
          bolt,
          flash * 0.75,
          2.8
        );

        /*
         * Branches.
         */

        for (
          let i = 0;
          i < branches.length;
          i += 1
        ) {
          drawPath(
            branches[i],
            flash * 0.55,
            1.5
          );
        }

        /*
         * Bright core.
         */

        ctx.shadowBlur = 8;

        drawPath(
          bolt,
          flash,
          1
        );

        /*
         * Bright branch cores.
         */

        for (
          let i = 0;
          i < branches.length;
          i += 1
        ) {
          drawPath(
            branches[i],
            flash * 0.8,
            0.7
          );
        }

        ctx.restore();
      }

      /*
       * Fade lightning.
       */

      flash *= 0.78;

      if (
        flash < 0.015
      ) {
        flash = 0;

        bolt = null;

        branches = [];
      }

      animationFrameId =
        requestAnimationFrame(
          drawLightning
        );
    };

    /* ============================================================
       TRIGGER LIGHTNING
       ============================================================ */

    const triggerLightning = () => {
      /*
       * Generate a completely
       * different bolt every time.
       */

      bolt = createBolt();

      branches =
        createBranches(
          bolt
        );

      /*
       * Main flash.
       */

      flash = 1;

      /*
       * SECOND FLICKER
       *
       * Happens 70ms later.
       */

      setTimeout(() => {
        if (
          Math.random() > 0.30
        ) {
          flash = 0.72;
        }
      }, 70);

      /*
       * THIRD FLICKER
       *
       * Happens 150ms later.
       */

      setTimeout(() => {
        if (
          Math.random() > 0.55
        ) {
          flash = 0.42;
        }
      }, 150);

      /*
       * ========================================================
       * EXACTLY 4 SECONDS
       * ========================================================
       */

      lightningTimeout =
        setTimeout(
          triggerLightning,
          4000
        );
    };

    /* ============================================================
       START
       ============================================================ */

    resize();

    drawLightning();

    /*
     * First lightning:
     * exactly 4 seconds after hero loads.
     */

    lightningTimeout =
      setTimeout(
        triggerLightning,
        4000
      );

    window.addEventListener(
      'resize',
      resize
    );

    /* ============================================================
       CLEANUP
       ============================================================ */

    return () => {
      window.removeEventListener(
        'resize',
        resize
      );

      if (
        animationFrameId !== null
      ) {
        cancelAnimationFrame(
          animationFrameId
        );
      }

      if (
        lightningTimeout !== null
      ) {
        clearTimeout(
          lightningTimeout
        );
      }
    };
  }, []);

  return (
    <>
      {/* ========================================================
          ATMOSPHERIC PARTICLES
          z-5
          ======================================================== */}

      <canvas
        ref={sceneCanvasRef}
        className="
          absolute
          inset-0
          w-full
          h-full
          pointer-events-none
          z-[5]
        "
        aria-hidden="true"
      />


      {/* ========================================================
          FOG
          z-7
          ======================================================== */}

      <div
        className="
          absolute
          inset-0
          pointer-events-none
          overflow-hidden
          z-[7]
        "
        aria-hidden="true"
      >

        {/* Far fog */}

        <div
          className="
            tatva-fog
            tatva-fog-1
          "
        />

        {/* Middle fog */}

        <div
          className="
            tatva-fog
            tatva-fog-2
          "
        />

        {/* Foreground fog */}

        <div
          className="
            tatva-fog
            tatva-fog-3
          "
        />

        {/* Ground mist */}

        <div
          className="
            tatva-ground-mist
          "
        />

      </div>


      {/* ========================================================
          LIGHTNING
          z-20
          ======================================================== */}

      <canvas
        ref={lightningCanvasRef}
        className="
          absolute
          inset-0
          w-full
          h-full
          pointer-events-none
          z-[20]
        "
        aria-hidden="true"
      />


      {/* ========================================================
          STYLES
          ======================================================== */}

      <style>{`

        /* ======================================================
           FOG BASE
           ====================================================== */

        .tatva-fog {

          position: absolute;

          width: 150%;

          height: 42%;

          left: -25%;

          border-radius: 50%;

          background:
            radial-gradient(
              ellipse at center,

              rgba(
                225,
                238,
                250,
                0.20
              ) 0%,

              rgba(
                215,
                231,
                247,
                0.13
              ) 28%,

              rgba(
                205,
                224,
                243,
                0.07
              ) 48%,

              rgba(
                200,
                220,
                240,
                0.025
              ) 64%,

              transparent 78%
            );

          filter:
            blur(38px);

          opacity:
            0.65;

          will-change:
            transform;

          transform:
            translate3d(
              0,
              0,
              0
            );
        }


        /* ======================================================
           FAR FOG
           ====================================================== */

        .tatva-fog-1 {

          bottom:
            16%;

          opacity:
            0.42;

          filter:
            blur(45px);

          animation:
            tatvaFogOne
            28s
            ease-in-out
            infinite
            alternate;
        }


        /* ======================================================
           MID FOG
           ====================================================== */

        .tatva-fog-2 {

          bottom:
            4%;

          opacity:
            0.52;

          filter:
            blur(52px);

          animation:
            tatvaFogTwo
            36s
            ease-in-out
            infinite
            alternate;
        }


        /* ======================================================
           CLOSE FOG
           ====================================================== */

        .tatva-fog-3 {

          bottom:
            -8%;

          opacity:
            0.34;

          filter:
            blur(65px);

          animation:
            tatvaFogThree
            44s
            ease-in-out
            infinite
            alternate;
        }


        /* ======================================================
           GROUND MIST
           ====================================================== */

        .tatva-ground-mist {

          position:
            absolute;

          left:
            -20%;

          bottom:
            -15%;

          width:
            140%;

          height:
            34%;

          border-radius:
            50%;

          background:
            radial-gradient(
              ellipse at center,

              rgba(
                225,
                239,
                251,
                0.24
              ) 0%,

              rgba(
                215,
                232,
                247,
                0.14
              ) 32%,

              rgba(
                205,
                224,
                242,
                0.06
              ) 55%,

              transparent 74%
            );

          filter:
            blur(55px);

          opacity:
            0.65;

          animation:
            groundMistMovement
            32s
            ease-in-out
            infinite
            alternate;
        }


        /* ======================================================
           FOG ANIMATION 1
           ====================================================== */

        @keyframes tatvaFogOne {

          0% {

            transform:
              translate3d(
                -10%,
                8px,
                0
              )
              scale(1);

          }

          50% {

            transform:
              translate3d(
                4%,
                -10px,
                0
              )
              scale(1.06);

          }

          100% {

            transform:
              translate3d(
                12%,
                4px,
                0
              )
              scale(1.02);

          }
        }


        /* ======================================================
           FOG ANIMATION 2
           ====================================================== */

        @keyframes tatvaFogTwo {

          0% {

            transform:
              translate3d(
                12%,
                6px,
                0
              )
              scale(1.04);

          }

          50% {

            transform:
              translate3d(
                -3%,
                -12px,
                0
              )
              scale(1.10);

          }

          100% {

            transform:
              translate3d(
                -15%,
                4px,
                0
              )
              scale(1.02);

          }
        }


        /* ======================================================
           FOG ANIMATION 3
           ====================================================== */

        @keyframes tatvaFogThree {

          0% {

            transform:
              translate3d(
                -14%,
                12px,
                0
              )
              scale(1.08);

          }

          50% {

            transform:
              translate3d(
                3%,
                -8px,
                0
              )
              scale(1.15);

          }

          100% {

            transform:
              translate3d(
                14%,
                5px,
                0
              )
              scale(1.04);

          }
        }


        /* ======================================================
           GROUND MIST
           ====================================================== */

        @keyframes groundMistMovement {

          0% {

            transform:
              translate3d(
                -8%,
                8px,
                0
              )
              scale(1);

          }

          50% {

            transform:
              translate3d(
                5%,
                -5px,
                0
              )
              scale(1.08);

          }

          100% {

            transform:
              translate3d(
                10%,
                4px,
                0
              )
              scale(1.02);

          }
        }


        /* ======================================================
           REDUCED MOTION
           ====================================================== */

        @media (
          prefers-reduced-motion: reduce
        ) {

          .tatva-fog-1,
          .tatva-fog-2,
          .tatva-fog-3,
          .tatva-ground-mist {

            animation:
              none !important;
          }
        }


        /* ======================================================
           MOBILE
           ====================================================== */

        @media (
          max-width: 640px
        ) {

          .tatva-fog {

            filter:
              blur(30px);
          }

          .tatva-fog-1 {

            opacity:
              0.32;
          }

          .tatva-fog-2 {

            opacity:
              0.40;
          }

          .tatva-fog-3 {

            opacity:
              0.28;
          }

          .tatva-ground-mist {

            opacity:
              0.48;
          }
        }

      `}</style>
    </>
  );
}