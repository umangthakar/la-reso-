"use client";

import { useEffect, useRef, useState } from "react";
import { type MotionValue, useMotionValueEvent } from "framer-motion";

const FRAME_COUNT = 240;
const FRAME_WIDTH = 1280;
const FRAME_HEIGHT = 720;

function framePath(index: number) {
  // index is 0-based; files are 1-based, zero-padded to 3 digits
  const n = String(index + 1).padStart(3, "0");
  return `/hero-frames/ezgif-frame-${n}.jpg`;
}

/**
 * Scroll-scrubbed image sequence rendered to a canvas.
 * `progress` (0 → 1) drives which frame is painted, so the cake
 * decorates itself as the user scrolls through the pinned hero.
 */
export function HeroSequence({
  progress,
  className,
}: {
  progress: MotionValue<number>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentFrameRef = useRef(-1);
  const [loaded, setLoaded] = useState(0);

  // Preload every frame once on mount.
  useEffect(() => {
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
        // Paint the very first frame as soon as it arrives.
        if (i === 0) draw(0);
      };
      images[i] = img;
    }
    imagesRef.current = images;

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw a frame with "object-cover" behaviour onto the canvas.
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

    const scale = Math.max((cw * dpr) / FRAME_WIDTH, (ch * dpr) / FRAME_HEIGHT);
    const dw = FRAME_WIDTH * scale;
    const dh = FRAME_HEIGHT * scale;
    const dx = (cw * dpr - dw) / 2;
    const dy = (ch * dpr - dh) / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, dx, dy, dw, dh);
    currentFrameRef.current = frame;
  }

  // Map scroll progress → frame index and repaint when it changes.
  useMotionValueEvent(progress, "change", (p) => {
    const frame = Math.min(
      FRAME_COUNT - 1,
      Math.max(0, Math.round(p * (FRAME_COUNT - 1)))
    );
    if (frame !== currentFrameRef.current) draw(frame);
  });

  // Repaint the active frame on resize so it stays covered & sharp.
  useEffect(() => {
    function onResize() {
      const frame = currentFrameRef.current >= 0 ? currentFrameRef.current : 0;
      draw(frame);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = loaded >= FRAME_COUNT;

  return (
    <>
      <canvas ref={canvasRef} className={className} />
      {!ready && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
          <span className="glass rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide text-wine-dark shadow-clay-sm">
            Plating your cake… {Math.round((loaded / FRAME_COUNT) * 100)}%
          </span>
        </div>
      )}
    </>
  );
}
