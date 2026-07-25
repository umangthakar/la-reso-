"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";

// ============================================================
// Le Rasa Bakery — premium luxury cake carousel (home hero)
// ------------------------------------------------------------
// Three cakes on stage at once — LEFT, CENTER, RIGHT. Every 5s the ring
// rotates one step: the centre glides left, the right cake takes the centre,
// the next cake slides in from the right and the old left leaves. The cakes
// are the ONLY things that move; the section around them is static.
//
// Every cake stays mounted the whole time and is simply animated to its slot,
// so there is no mount/unmount flash and the incoming image is already decoded
// off-stage before it glides in. Only translateX / scale / opacity animate —
// all GPU-composited, no layout, no reflow. The component re-renders just once
// per 5s tick; Framer runs the 0.8s glide on the compositor in between.
// ============================================================

const ROTATE_MS = 5000; // one position every 5 seconds
const DURATION = 0.8; // 700–900ms premium glide
const EASE: [number, number, number, number] = [0.22, 0.61, 0.36, 1]; // no bounce

type Slot = { x: string; scale: number; opacity: number; zIndex: number };

// Where a cake sits, by its signed distance from the centred cake.
function slotFor(distance: number): Slot {
  switch (distance) {
    case 0:
      return { x: "0%", scale: 1, opacity: 1, zIndex: 30 }; // dominant centre
    case -1:
      return { x: "-62%", scale: 0.82, opacity: 0.8, zIndex: 20 }; // left
    case 1:
      return { x: "62%", scale: 0.82, opacity: 0.8, zIndex: 20 }; // right
    default:
      // Off-stage on the correct side, invisible. The incoming cake (d ≥ 2) is
      // already mounted here so its image is ready before it glides to centre.
      return distance < 0
        ? { x: "-120%", scale: 0.7, opacity: 0, zIndex: 10 }
        : { x: "120%", scale: 0.7, opacity: 0, zIndex: 10 };
  }
}

// Shortest signed distance on a ring of n cakes, so each takes the nearest path
// (and any wrap-around happens while it's invisible off-stage).
function circularDistance(from: number, to: number, n: number): number {
  let d = (to - from) % n;
  if (d > n / 2) d -= n;
  if (d < -n / 2) d += n;
  return d;
}

export function HomeSlider({ images }: { images: string[] }) {
  const slides = useMemo(() => images.filter(Boolean), [images]);
  const n = slides.length;
  const [center, setCenter] = useState(0);
  const reduce = useReducedMotion();

  // Advance one position every 5s. One tiny state change per tick — no per-frame
  // React work. Paused for reduced-motion users and when there's nothing to
  // rotate (0 or 1 cake).
  useEffect(() => {
    if (reduce || n <= 1) return;
    const id = setInterval(() => setCenter((c) => (c + 1) % n), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduce, n]);

  if (n === 0) return null;

  return (
    <section className="container mt-4">
      {/* Static stage — fixed responsive height, so nothing around it shifts as
          the cakes move. overflow-hidden clips the peeking side cakes. */}
      <div className="relative h-[300px] w-full overflow-hidden sm:h-[360px] lg:h-[440px]">
        {slides.map((src, i) => {
          const target = slotFor(circularDistance(center, i, n));
          return (
            <motion.div
              key={i}
              // Auto-margins centre the card without using transform, leaving
              // the transform free for the GPU-animated x / scale.
              className="absolute inset-0 m-auto h-[220px] w-[220px] overflow-hidden rounded-[24px] shadow-clay-sm sm:h-[280px] sm:w-[280px] lg:h-[360px] lg:w-[360px]"
              style={{ willChange: "transform, opacity" }}
              // No entrance animation: snap to the opening layout, then only ever
              // glide between slots — never a first-paint flash.
              initial={false}
              animate={target}
              transition={{ duration: DURATION, ease: EASE }}
            >
              <Image
                src={src}
                alt=""
                fill
                // Eager so every cake (including the next one) is decoded up
                // front — the carousel never shows empty space or flashes.
                loading="eager"
                sizes="(max-width: 640px) 220px, (max-width: 1024px) 280px, 360px"
                className="object-cover"
              />
              {/* Soft rose wash — same design-system overlay as before. */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#3b1622]/25 to-transparent" />
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
