import { useState } from 'react';
import { TatvaLogo } from './TatvaLogo';
import { FooterInfoModal } from './FooterInfoModal';

export function Footer({ onSelectNav, onOpenIncidentReport }) {
  const [infoModalType, setInfoModalType] = useState(null);

  return (
    <footer
      className="
        relative
        w-full
        overflow-hidden
        select-none
        border-t
        border-blue-100/70
        bg-[#edf4ff]
        text-slate-800
      "
    >

      {/* ============================================================
          ATMOSPHERIC BACKGROUND
          ============================================================ */}

      <div
        className="
          absolute
          inset-0
          z-0
          overflow-hidden
          pointer-events-none
        "
        aria-hidden="true"
      >

        {/* Large soft blue glow */}

        <div
          className="
            absolute
            left-1/2
            top-[-180px]
            h-[420px]
            w-[850px]
            -translate-x-1/2
            rounded-full
            bg-[#c9dcff]/40
            blur-[110px]
            animate-footerGlow
          "
        />

        {/* Lower left atmospheric fog */}

        <div
          className="
            absolute
            left-[-15%]
            bottom-[-180px]
            h-[360px]
            w-[70%]
            rounded-full
            bg-[#d8e7ff]/55
            blur-[100px]
            animate-footerFog
          "
        />

        {/* Lower right atmospheric fog */}

        <div
          className="
            absolute
            right-[-15%]
            bottom-[-180px]
            h-[360px]
            w-[70%]
            rounded-full
            bg-[#c8dcff]/45
            blur-[110px]
            animate-footerFogReverse
          "
        />

        {/* Center atmospheric light */}

        <div
          className="
            absolute
            left-1/2
            top-1/2
            h-[500px]
            w-[900px]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-[#dceaff]/35
            blur-[130px]
          "
        />

        {/* ========================================================
            ATMOSPHERIC HORIZONTAL LINES
            ======================================================== */}

        <div className="absolute inset-0 opacity-30">

          <div className="footer-atmosphere-line footer-line-1" />

          <div className="footer-atmosphere-line footer-line-2" />

          <div className="footer-atmosphere-line footer-line-3" />

        </div>


        {/* ========================================================
            FLOATING PARTICLES
            ======================================================== */}

        <div className="footer-particle footer-particle-1" />
        <div className="footer-particle footer-particle-2" />
        <div className="footer-particle footer-particle-3" />
        <div className="footer-particle footer-particle-4" />
        <div className="footer-particle footer-particle-5" />
        <div className="footer-particle footer-particle-6" />
        <div className="footer-particle footer-particle-7" />
        <div className="footer-particle footer-particle-8" />

      </div>


      {/* ============================================================
          TOP SOFT GRADIENT TRANSITION
          ============================================================ */}

      <div
        className="
          relative
          z-20
          h-14
          w-full
          bg-gradient-to-b
          from-[#f8fafc]
          via-[#f0f6ff]/75
          to-transparent
          pointer-events-none
        "
      />


      {/* ============================================================
          DECORATIVE WAVE DIVIDER
          ============================================================ */}

      <div
        className="
          relative
          z-20
          -mt-14
          h-8
          w-full
          overflow-hidden
          rotate-180
          leading-none
        "
      >

        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="
            block
            h-8
            w-full
            fill-current
            text-[#f8fafc]
            opacity-80
          "
        >

          <path
            d="
              M0,0
              C150,90
              350,-40
              500,50
              C650,140
              900,10
              1200,40
              L1200,120
              L0,120
              Z
            "
          />

        </svg>

      </div>


      {/* ============================================================
          MAIN FOOTER CONTENT
          ============================================================ */}

      <div
        className="
          relative
          z-30
          mx-auto
          max-w-7xl
          px-6
          pt-12
          pb-8
        "
      >

        <div
          className="
            grid
            grid-cols-1
            gap-10
            border-b
            border-blue-200/45
            pb-10
            md:grid-cols-2
            lg:grid-cols-12
            lg:gap-10
          "
        >


          {/* ========================================================
              COLUMN 1 — BRAND
              ======================================================== */}

          <div className="lg:col-span-4">

            <div
              className="
                mb-4
                flex
                items-center
                gap-4
              "
            >

              <TatvaLogo
                size="sm"
                showText={false}
              />

              <span
                className="
                  text-3xl
                  font-black
                  uppercase
                  tracking-[0.12em]
                  text-slate-900
                  font-['Plus_Jakarta_Sans',sans-serif]
                "
              >
                TATVA
              </span>

            </div>


            <p
              className="
                max-w-md
                text-base
                font-semibold
                leading-relaxed
                text-slate-700
                sm:text-lg
              "
            >
              National Weather Big Data Analytics Platform
            </p>


            <p
              className="
                mt-2
                text-base
                font-medium
                italic
                text-slate-500
                sm:text-lg
              "
            >
              Data for a Safer, Stronger India.
            </p>

          </div>


          {/* ========================================================
              COLUMN 2 — QUICK LINKS
              ======================================================== */}

          <div className="lg:col-span-2">

            <h4
              className="
                mb-5
                text-base
                font-extrabold
                uppercase
                tracking-[0.08em]
                text-slate-900
                sm:text-lg
              "
            >
              Quick Links
            </h4>


            <ul
              className="
                space-y-3
                text-base
                font-medium
                text-slate-700
                sm:text-lg
              "
            >

              <li>

                <button
                  onClick={() => {
                    onSelectNav('analysis');

                    document
                      .getElementById('analysis-section')
                      ?.scrollIntoView({
                        behavior: 'smooth',
                      });
                  }}
                  className="
                    cursor-pointer
                    transition-all
                    duration-200
                    hover:translate-x-1
                    hover:text-blue-600
                  "
                >
                  Analysis
                </button>

              </li>


              <li>

                <button
                  onClick={onOpenIncidentReport}
                  className="
                    cursor-pointer
                    transition-all
                    duration-200
                    hover:translate-x-1
                    hover:text-blue-600
                  "
                >
                  Incident Report
                </button>

              </li>


              <li>

                <button
                  onClick={() => {
                    onSelectNav('how-it-works');

                    document
                      .getElementById('how-it-works-section')
                      ?.scrollIntoView({
                        behavior: 'smooth',
                      });
                  }}
                  className="
                    cursor-pointer
                    transition-all
                    duration-200
                    hover:translate-x-1
                    hover:text-blue-600
                  "
                >
                  How It Works
                </button>

              </li>

            </ul>

          </div>


          {/* ========================================================
              COLUMN 3 — SUPPORT
              ======================================================== */}

          <div className="lg:col-span-2">

            <h4
              className="
                mb-5
                text-base
                font-extrabold
                uppercase
                tracking-[0.08em]
                text-slate-900
                sm:text-lg
              "
            >
              Support
            </h4>


            <ul
              className="
                space-y-3
                text-base
                font-medium
                text-slate-700
                sm:text-lg
              "
            >

              <li>

                <button
                  onClick={() =>
                    setInfoModalType('faqs')
                  }
                  className="
                    cursor-pointer
                    text-left
                    transition-all
                    duration-200
                    hover:translate-x-1
                    hover:text-blue-600
                  "
                >
                  FAQs
                </button>

              </li>


              <li>

                <button
                  onClick={() =>
                    setInfoModalType('contact')
                  }
                  className="
                    cursor-pointer
                    text-left
                    transition-all
                    duration-200
                    hover:translate-x-1
                    hover:text-blue-600
                  "
                >
                  Contact Us
                </button>

              </li>


              <li>

                <button
                  onClick={() =>
                    setInfoModalType('feedback')
                  }
                  className="
                    cursor-pointer
                    text-left
                    transition-all
                    duration-200
                    hover:translate-x-1
                    hover:text-blue-600
                  "
                >
                  Feedback
                </button>

              </li>

            </ul>

          </div>


          {/* ========================================================
              COLUMN 4 — FOLLOW US
              ======================================================== */}

          <div className="lg:col-span-2">

            <h4
              className="
                mb-5
                text-base
                font-extrabold
                uppercase
                tracking-[0.08em]
                text-slate-900
                sm:text-lg
              "
            >
              Follow Us
            </h4>


            <div
              className="
                flex
                items-center
                gap-3
              "
            >

              {/* ==================================================
                  LINKEDIN
                  ================================================== */}

              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
                className="
                  flex
                  h-11
                  w-11
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-blue-200/60
                  bg-white/75
                  text-slate-700
                  shadow-sm
                  backdrop-blur-sm
                  transition-all
                  duration-300
                  hover:-translate-y-1
                  hover:border-blue-500
                  hover:bg-blue-600
                  hover:text-white
                  hover:shadow-lg
                "
              >

                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 24 24"
                >

                  <path
                    d="
                      M19 3a2 2 0 0 1 2 2v14
                      a2 2 0 0 1-2 2H5
                      a2 2 0 0 1-2-2V5
                      a2 2 0 0 1 2-2h14
                      m-.5 15.5v-5.3
                      a3.26 3.26 0 0 0-3.26-3.26
                      c-.85 0-1.84.52-2.28 1.3
                      v-1.11h-2.79v8.37h2.79v-4.93
                      c0-.77.62-1.4 1.39-1.4
                      a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75
                      M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68
                      c0-.93-.75-1.69-1.68-1.69
                      a1.69 1.69 0 0 0-1.69 1.69
                      c0 .93.76 1.68 1.69 1.68
                      m1.39 9.94v-8.37H5.5v8.37h2.77z
                    "
                  />

                </svg>

              </a>


              {/* ==================================================
                  X / TWITTER
                  ================================================== */}

              <a
                href="https://twitter.com"
                target="_blank"
                rel="noreferrer"
                aria-label="Twitter"
                className="
                  flex
                  h-11
                  w-11
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-blue-200/60
                  bg-white/75
                  text-slate-700
                  shadow-sm
                  backdrop-blur-sm
                  transition-all
                  duration-300
                  hover:-translate-y-1
                  hover:border-slate-900
                  hover:bg-slate-900
                  hover:text-white
                  hover:shadow-lg
                "
              >

                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 24 24"
                >

                  <path
                    d="
                      M18.244 2.25h3.308
                      l-7.227 8.26
                      8.502 11.24H16.17
                      l-5.214-6.817
                      L4.99 21.75H1.68
                      l7.73-8.835
                      L1.254 2.25H8.08
                      l4.713 6.231z
                      m-1.161 17.52h1.833
                      L7.084 4.126H5.117z
                    "
                  />

                </svg>

              </a>


              {/* ==================================================
                  YOUTUBE
                  ================================================== */}

              <a
                href="https://youtube.com"
                target="_blank"
                rel="noreferrer"
                aria-label="YouTube"
                className="
                  flex
                  h-11
                  w-11
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-blue-200/60
                  bg-white/75
                  text-slate-700
                  shadow-sm
                  backdrop-blur-sm
                  transition-all
                  duration-300
                  hover:-translate-y-1
                  hover:border-red-500
                  hover:bg-red-600
                  hover:text-white
                  hover:shadow-lg
                "
              >

                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 24 24"
                >

                  <path
                    d="
                      M23.498 6.186
                      a3.016 3.016 0 0 0-2.122-2.136
                      C19.505 3.545 12 3.545 12 3.545
                      s-7.505 0-9.377.505
                      A3.017 3.017 0 0 0 .502 6.186
                      C0 8.07 0 12 0 12
                      s0 3.93.502 5.814
                      a3.016 3.016 0 0 0 2.122 2.136
                      c1.871.505 9.376.505 9.376.505
                      s7.505 0 9.377-.505
                      a3.015 3.015 0 0 0 2.122-2.136
                      C24 15.93 24 12 24 12
                      s0-3.93-.502-5.814z
                      M9.545 15.568V8.432
                      L15.818 12
                      l-6.273 3.568z
                    "
                  />

                </svg>

              </a>


              {/* ==================================================
                  GITHUB
                  ================================================== */}

              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="
                  flex
                  h-11
                  w-11
                  items-center
                  justify-center
                  rounded-xl
                  border
                  border-blue-200/60
                  bg-white/75
                  text-slate-700
                  shadow-sm
                  backdrop-blur-sm
                  transition-all
                  duration-300
                  hover:-translate-y-1
                  hover:border-slate-900
                  hover:bg-slate-900
                  hover:text-white
                  hover:shadow-lg
                "
              >

                <svg
                  className="h-5 w-5 fill-current"
                  viewBox="0 0 24 24"
                >

                  <path
                    d="
                      M12 2A10 10 0 0 0 2 12
                      c0 4.42 2.87 8.17 6.84 9.5
                      .5.08.66-.23.66-.5v-1.69
                      c-2.77.6-3.36-1.34-3.36-1.34
                      -.46-1.16-1.11-1.47-1.11-1.47
                      -.91-.62.07-.6.07-.6
                      1 .07 1.53 1.03 1.53 1.03
                      .87 1.52 2.34 1.07 2.91.83
                      .09-.65.35-1.09.63-1.34
                      -2.22-.25-4.55-1.11-4.55-4.92
                      0-1.11.38-2 1.03-2.71
                      -.1-.25-.45-1.29.1-2.64
                      0 0 .84-.27 2.75 1.02
                      .79-.22 1.65-.33 2.5-.33
                      .85 0 1.71.11 2.5.33
                      1.91-1.29 2.75-1.02 2.75-1.02
                      .55 1.35.2 2.39.1 2.64
                      .65.71 1.03 1.6 1.03 2.71
                      0 3.82-2.34 4.66-4.57 4.91
                      .36.31.69.92.69 1.85V21
                      c0 .27.16.59.67.5
                      C19.14 20.16 22 16.42 22 12
                      A10 10 0 0 0 12 2z
                    "
                  />

                </svg>

              </a>

            </div>

          </div>


          {/* ========================================================
              COLUMN 5 — BHARAT RESILIENT
              ======================================================== */}

          <div
            className="
              lg:col-span-2
              flex
              flex-col
              items-start
              justify-center
              lg:items-end
            "
          >

            <div className="text-left lg:text-right">

              <span
                className="
                  block
                  text-base
                  font-semibold
                  tracking-wide
                  text-slate-600
                  sm:text-lg
                "
              >
                Together for a
              </span>


              <span
                className="
                  block
                  text-lg
                  font-extrabold
                  leading-tight
                  tracking-wide
                  text-slate-900
                  sm:text-xl
                "
              >
                Weather Resilient
                <br />
                Bharat
              </span>


              <div
                className="
                  mt-3
                  flex
                  h-1.5
                  w-32
                  overflow-hidden
                  rounded-full
                  shadow-sm
                  lg:ml-auto
                "
              >

                <div className="w-1/2 bg-amber-500" />

                <div className="w-1/2 bg-emerald-500" />

              </div>

            </div>

          </div>

        </div>


        {/* ============================================================
            BOTTOM LEGAL BAR
            ============================================================ */}

        <div
          className="
            flex
            flex-col
            items-center
            justify-between
            gap-5
            pt-7
            text-sm
            font-medium
            text-slate-600
            sm:flex-row
            sm:text-base
          "
        >

          <div>
            © 2026 TATVA. All rights reserved.
          </div>


          <div
            className="
              flex
              flex-wrap
              items-center
              justify-center
              gap-3
              sm:gap-5
            "
          >

            <button
              onClick={() =>
                setInfoModalType('privacy')
              }
              className="
                cursor-pointer
                transition-colors
                hover:text-blue-600
              "
            >
              Privacy Policy
            </button>


            <span>|</span>


            <button
              onClick={() =>
                setInfoModalType('terms')
              }
              className="
                cursor-pointer
                transition-colors
                hover:text-blue-600
              "
            >
              Terms of Use
            </button>


            <span>|</span>


            <button
              onClick={() =>
                setInfoModalType('accessibility')
              }
              className="
                cursor-pointer
                transition-colors
                hover:text-blue-600
              "
            >
              Accessibility
            </button>

          </div>

        </div>

      </div>


      {/* ============================================================
          FOOTER MODAL
          ============================================================ */}

      <FooterInfoModal
        type={infoModalType}
        onClose={() =>
          setInfoModalType(null)
        }
      />


      {/* ============================================================
          FOOTER ANIMATIONS
          ============================================================ */}

      <style>{`

        /* ==========================================================
           TOP GLOW
           ========================================================== */

        .animate-footerGlow {

          animation:
            footerGlow
            12s
            ease-in-out
            infinite
            alternate;
        }


        @keyframes footerGlow {

          0% {

            transform:
              translateX(-50%)
              translateY(15px)
              scale(0.92);

            opacity: 0.45;
          }


          100% {

            transform:
              translateX(-50%)
              translateY(-15px)
              scale(1.08);

            opacity: 0.75;
          }

        }


        /* ==========================================================
           LEFT FOG
           ========================================================== */

        .animate-footerFog {

          animation:
            footerFog
            24s
            ease-in-out
            infinite
            alternate;
        }


        @keyframes footerFog {

          0% {

            transform:
              translate3d(
                -5%,
                8px,
                0
              )
              scale(1);
          }


          100% {

            transform:
              translate3d(
                18%,
                -8px,
                0
              )
              scale(1.08);
          }

        }


        /* ==========================================================
           RIGHT FOG
           ========================================================== */

        .animate-footerFogReverse {

          animation:
            footerFogReverse
            30s
            ease-in-out
            infinite
            alternate;
        }


        @keyframes footerFogReverse {

          0% {

            transform:
              translate3d(
                5%,
                -5px,
                0
              )
              scale(1.04);
          }


          100% {

            transform:
              translate3d(
                -18%,
                8px,
                0
              )
              scale(1.12);
          }

        }


        /* ==========================================================
           ATMOSPHERIC LINES
           ========================================================== */

        .footer-atmosphere-line {

          position: absolute;

          left: -15%;

          width: 80%;

          height: 1px;

          background:
            linear-gradient(
              90deg,
              transparent,
              rgba(
                117,
                166,
                225,
                0.18
              ),
              transparent
            );

          filter:
            blur(0.5px);
        }


        .footer-line-1 {

          top: 30%;

          animation:
            footerLineMove
            18s
            linear
            infinite;
        }


        .footer-line-2 {

          top: 52%;

          width: 65%;

          animation:
            footerLineMove
            23s
            linear
            infinite
            reverse;
        }


        .footer-line-3 {

          top: 73%;

          width: 90%;

          animation:
            footerLineMove
            27s
            linear
            infinite;
        }


        @keyframes footerLineMove {

          0% {

            transform:
              translateX(-20%);
          }


          100% {

            transform:
              translateX(170%);
          }

        }


        /* ==========================================================
           PARTICLES
           ========================================================== */

        .footer-particle {

          position: absolute;

          width: 3px;

          height: 3px;

          border-radius: 9999px;

          background:
            rgba(
              112,
              165,
              229,
              0.4
            );

          box-shadow:
            0 0 12px
            rgba(
              112,
              165,
              229,
              0.35
            );

          animation:
            footerParticleFloat
            8s
            ease-in-out
            infinite
            alternate;
        }


        .footer-particle-1 {

          left: 8%;
          top: 20%;
        }


        .footer-particle-2 {

          left: 21%;
          top: 68%;

          animation-delay:
            -2s;
        }


        .footer-particle-3 {

          left: 39%;
          top: 32%;

          animation-delay:
            -4s;
        }


        .footer-particle-4 {

          left: 58%;
          top: 65%;

          animation-delay:
            -1s;
        }


        .footer-particle-5 {

          left: 72%;
          top: 25%;

          animation-delay:
            -5s;
        }


        .footer-particle-6 {

          left: 88%;
          top: 52%;

          animation-delay:
            -3s;
        }


        .footer-particle-7 {

          left: 48%;
          top: 84%;

          animation-delay:
            -6s;
        }


        .footer-particle-8 {

          left: 94%;
          top: 78%;

          animation-delay:
            -4s;
        }


        @keyframes footerParticleFloat {

          0% {

            transform:
              translate3d(
                0,
                12px,
                0
              );

            opacity: 0.15;
          }


          50% {

            opacity: 0.5;
          }


          100% {

            transform:
              translate3d(
                15px,
                -15px,
                0
              );

            opacity: 0.15;
          }

        }


        /* ==========================================================
           ACCESSIBILITY
           ========================================================== */

        @media (
          prefers-reduced-motion: reduce
        ) {

          .animate-footerGlow,
          .animate-footerFog,
          .animate-footerFogReverse,
          .footer-atmosphere-line,
          .footer-particle {

            animation:
              none !important;
          }

        }


        /* ==========================================================
           MOBILE
           ========================================================== */

        @media (
          max-width: 640px
        ) {

          .footer-atmosphere-line {

            width: 115%;
          }

        }

      `}</style>

    </footer>
  );
}