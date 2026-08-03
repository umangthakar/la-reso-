"use client"

import React from "react"
import Image from "next/image"
import { Swiper, SwiperSlide } from "swiper/react"

import "swiper/css"
import "swiper/css/effect-coverflow"
import "swiper/css/pagination"
import "swiper/css/navigation"

import {
  Autoplay,
  EffectCoverflow,
  Navigation,
  Pagination,
} from "swiper/modules"

interface CarouselProps {
  // `href` (optional) makes the slide a link — used by the Instagram Reels
  // gallery so each thumbnail opens its reel. Existing callers omit it and
  // render exactly as before.
  images: { src: string; alt: string; href?: string }[]
  autoplayDelay?: number
  showPagination?: boolean
  showNavigation?: boolean
  // Skip the Next image optimizer — needed when `src` is a same-origin proxy
  // route (e.g. Instagram thumbnails) that may redirect to an SVG placeholder.
  unoptimized?: boolean
}

/** Fixed slide box from the `.swiper-slide` rule below, plus `spaceBetween`. */
const SLIDE_WIDTH = 300
const SLIDE_GAP = 30

/**
 * How many slides loop mode needs before Swiper will accept it.
 *
 * `slidesPerView="auto"` means the visible count depends on the viewport, so a
 * constant threshold can't work: 10 slides loop fine on a phone and are "not
 * enough" on a desktop. Swiper wants roughly twice the visible count (it
 * duplicates the run to fake the wrap), so we measure the container and derive
 * it. Below the threshold loop is switched OFF — which is what Swiper did
 * anyway, only silently and after logging a warning on every render.
 */
function useLoopEnabled(slideCount: number) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [enabled, setEnabled] = React.useState(false)

  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const measure = () => {
      const width = el.clientWidth || window.innerWidth
      const perView = Math.max(1, Math.ceil(width / (SLIDE_WIDTH + SLIDE_GAP)))
      setEnabled(slideCount >= perView * 2 + 1)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [slideCount])

  return { containerRef, loopEnabled: enabled }
}

export const CardCarousel: React.FC<CarouselProps> = ({
  images,
  autoplayDelay = 1500,
  showPagination = true,
  showNavigation = true,
  unoptimized = false,
}) => {
  const { containerRef, loopEnabled } = useLoopEnabled(images.length)
  const css = `
  .swiper {
    width: 100%;
    padding-bottom: 50px;
  }

  .swiper-slide {
    background-position: center;
    background-size: cover;
    width: ${SLIDE_WIDTH}px;
  }

  .swiper-slide img {
    display: block;
    width: 100%;
  }

  .swiper-3d .swiper-slide-shadow-left {
    background-image: none;
  }
  .swiper-3d .swiper-slide-shadow-right {
    background: none;
  }

  /* Skeleton shown behind a card while its image loads. The loaded image
     (object-cover) paints on top and hides it. Same size as the card. */
  .lr-card-skeleton {
    background: linear-gradient(100deg, #F1DDD6 30%, #F9EEEA 50%, #F1DDD6 70%);
    background-size: 200% 100%;
    animation: lr-card-shimmer 1.4s ease-in-out infinite;
  }
  @keyframes lr-card-shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  `
  return (
    <section className="w-full">
      <style>{css}</style>
      <div className="w-full" ref={containerRef}>
        <Swiper
          // Re-init when loop flips, so Swiper rebuilds its duplicated slides
          // instead of trying to toggle the mode in place.
          key={loopEnabled ? "loop" : "no-loop"}
          spaceBetween={SLIDE_GAP}
          autoplay={{
            delay: autoplayDelay,
            disableOnInteraction: false,
          }}
          effect={"coverflow"}
          grabCursor={true}
          centeredSlides={true}
          loop={loopEnabled}
          slidesPerView={"auto"}
          coverflowEffect={{
            rotate: 0,
            stretch: 0,
            depth: 100,
            modifier: 2.5,
          }}
          pagination={showPagination ? { clickable: true } : false}
          navigation={
            showNavigation
              ? {
                  nextEl: ".swiper-button-next",
                  prevEl: ".swiper-button-prev",
                }
              : undefined
          }
          modules={[EffectCoverflow, Autoplay, Pagination, Navigation]}
        >
          {images.map((image, index) => {
            const media = (
              <div className="lr-card-skeleton size-full rounded-3xl overflow-hidden aspect-square">
                <Image
                  src={image.src}
                  width={300}
                  height={300}
                  unoptimized={unoptimized}
                  className="size-full object-cover rounded-xl"
                  alt={image.alt}
                />
              </div>
            )
            return (
              <SwiperSlide key={index}>
                {image.href ? (
                  <a
                    href={image.href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={image.alt}
                    className="block size-full"
                  >
                    {media}
                  </a>
                ) : (
                  media
                )}
              </SwiperSlide>
            )
          })}
        </Swiper>
      </div>
    </section>
  )
}
