"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

const FRAME_COUNT = 240;
const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;

function framePath(index: number) {
  // index is 0-based; files are 1-based, zero-padded to 3 digits.
  const n = String(index + 1).padStart(3, "0");
  return `/frames/ezgif-frame-${n}.jpg`;
}

/**
 * The entry animation: "Le Rasa" shows centered for 1 second, then the hero
 * video auto-plays with sound — no button, no interaction. When the video
 * finishes, `onComplete` fires and the parent redirects to /menu.
 *
 * Mobile gets no heavy splash: it completes immediately and redirects straight
 * to /menu.
 */
export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [clicked, setClicked] = useState(false); // entry screen fade-out
  const [playing, setPlaying] = useState(false); // MODE 2 active (video)
  const [muted, setMuted] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Desktop video (mobile skips the splash entirely).
  const videoSrc = "/hero-animation.mp4";

  // Track the breakpoint so we can skip all the heavy frame/video work on phones.
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Mobile has no video splash — complete immediately so the home page shows.
  useEffect(() => {
    if (isMobile) onComplete();
  }, [isMobile, onComplete]);

  const imagesRef = useRef<HTMLImageElement[]>([]);
  const targetFrameRef = useRef(0);
  const currentFrameRef = useRef(-1);
  const [loaded, setLoaded] = useState(0);

  // Draw a frame onto the canvas with "object-cover" behaviour.
  function draw(frame: number) {
    const canvas = canvasRef.current;
    const img = imagesRef.current[frame];
    if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
    }

    // On mobile, zoom 1.8x from center so the landscape frame fills the
    // portrait viewport (matching the video's mobile crop).
    const zoom = window.innerWidth <= 768 ? 1.8 : 1;
    const scale =
      Math.max((cw * dpr) / FRAME_WIDTH, (ch * dpr) / FRAME_HEIGHT) * zoom;
    const dw = FRAME_WIDTH * scale;
    const dh = FRAME_HEIGHT * scale;
    const dx = (cw * dpr - dw) / 2;
    const dy = (ch * dpr - dh) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, dx, dy, dw, dh);
    currentFrameRef.current = frame;
  }

  // MODE 1 — preload every frame, then scroll-scrub the canvas.
  // Skipped entirely on mobile, which never sees the splash.
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) return;
    let active = true;
    const images: HTMLImageElement[] = new Array(FRAME_COUNT);
    let count = 0;

    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = framePath(i);
      img.onload = img.onerror = () => {
        if (!active) return;
        count += 1;
        setLoaded(count);
        if (i === 0) draw(0); // paint the first frame as soon as it lands
      };
      images[i] = img;
    }
    imagesRef.current = images;

    // Scroll → target frame index.
    const handleScroll = () => {
      const section = sectionRef.current;
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const sectionHeight = section.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / sectionHeight));
      targetFrameRef.current = Math.round(progress * (FRAME_COUNT - 1));
    };

    // requestAnimationFrame render loop — repaint when the frame changes.
    let raf = 0;
    const render = () => {
      const frame = targetFrameRef.current;
      if (frame !== currentFrameRef.current) draw(frame);
      raf = requestAnimationFrame(render);
    };

    const onResize = () => draw(currentFrameRef.current >= 0 ? currentFrameRef.current : 0);

    raf = requestAnimationFrame(render);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile]);

  // Auto-play: after "Le Rasa" shows for 1 second, start the hero video with
  // sound — no user interaction. Desktop only (mobile skips the splash).
  useEffect(() => {
    if (isMobile) return;
    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (!video) return;
      setClicked(true);
      setPlaying(true);
      video.muted = false;
      video.volume = 0.7;
      setMuted(false);
      video.currentTime = 0;
      void video.play().catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [isMobile]);

  // Redirect to the menu the moment the video finishes playing.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => onComplete();
    video.addEventListener("ended", handleEnded);
    return () => video.removeEventListener("ended", handleEnded);
  }, [onComplete]);

  // Double-click / double-tap anywhere skips straight to the menu.
  const handleDoubleClick = () => onComplete();

  // "Double tap to skip" hint — fades out after 3 seconds.
  const [showHint, setShowHint] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Toggle the video sound from the bottom-right control.
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !muted;
    video.muted = next;
    if (!next) video.volume = 0.7;
    setMuted(next);
  };

  const ready = loaded >= FRAME_COUNT;

  return (
    <>
      {/* ───────────────── DESKTOP SPLASH (md and up) ───────────────── */}
      <section
        ref={sectionRef}
        id="hero"
        className="relative -mt-[110px] hidden h-[500vh] md:block"
      >
      {/* Pinned stage — sticky so it stays in view through the tall section */}
      <div
        onDoubleClick={handleDoubleClick}
        className="sticky top-0 h-screen overflow-hidden"
      >
        {/* MODE 1 — scroll-scrubbed JPG frames on a canvas */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-0 h-full w-full"
          style={{ display: playing ? "none" : "block" }}
        />

        {/* MODE 2 — full-speed video with sound, shown after "Enter" */}
        <video
          ref={videoRef}
          src={isMobile ? undefined : videoSrc}
          playsInline
          preload={isMobile ? "none" : "auto"}
          className="absolute inset-0 z-0 h-full w-full object-cover"
          style={{ display: playing ? "block" : "none" }}
        />

        {/* Frame-preload progress (only while scrubbing) */}
        {!playing && !ready && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
            <span className="glass rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide text-wine-dark shadow-clay-sm">
              Plating your cake… {Math.round((loaded / FRAME_COUNT) * 100)}%
            </span>
          </div>
        )}

        {/* Mute / unmute toggle — bottom-right (only meaningful in video mode) */}
        {playing && (
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? "Unmute video" : "Mute video"}
            className="glass absolute bottom-5 right-5 z-20 flex h-11 w-11 items-center justify-center rounded-full text-lg text-wine-dark shadow-clay-sm transition hover:scale-105"
          >
            {muted ? "🔇" : "🔊"}
          </button>
        )}

        {/* Skip hint — fades out after 3 seconds */}
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center transition-opacity duration-700 ${
            showHint ? "opacity-100" : "opacity-0"
          }`}
        >
          <span className="text-xs text-white/50">Double tap to skip</span>
        </div>

        {/* Premium bakery entry screen — fades out once "Enter" is clicked */}
        <motion.div
          className="absolute inset-0 z-10 px-4"
          animate={clicked ? { opacity: 0, y: -20 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{ pointerEvents: clicked ? "none" : "auto" }}
          aria-hidden={clicked}
        >
          {/* Soft blurred colour blobs */}
          <div className="pointer-events-none absolute -left-10 top-1/4 h-72 w-72 rounded-full bg-[#D5A4A4] opacity-30 blur-3xl" />
          <div className="pointer-events-none absolute right-0 top-1/3 h-80 w-80 rounded-full bg-[#B38E91] opacity-30 blur-3xl" />
          <div className="pointer-events-none absolute bottom-10 left-1/3 h-64 w-64 rounded-full bg-[#D5A4A4] opacity-30 blur-3xl" />

          {/* Centered logo & tagline */}
          <div className="relative flex h-full flex-col items-center justify-center text-center">
            <h1 className="font-display text-5xl leading-none text-[#612437] sm:text-6xl md:text-8xl">
              Le Rasa
            </h1>
            <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#873853] md:text-sm">
              Eggless Bakery
            </p>
            <p className="mt-2 text-base text-[#9C616D] md:text-lg">
              The House of Eggless Desserts
            </p>
          </div>
        </motion.div>

        {/* Soft blend into the next section */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-b from-transparent to-blush-50/85" />
      </div>

      </section>

    </>
  );
}
