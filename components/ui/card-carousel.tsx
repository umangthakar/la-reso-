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

export const CardCarousel: React.FC<CarouselProps> = ({
  images,
  autoplayDelay = 1500,
  showPagination = true,
  showNavigation = true,
  unoptimized = false,
}) => {
  const css = `
  .swiper {
    width: 100%;
    padding-bottom: 50px;
  }

  .swiper-slide {
    background-position: center;
    background-size: cover;
    width: 300px;
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
  `
  return (
    <section className="w-full">
      <style>{css}</style>
      <div className="w-full">
        <Swiper
          spaceBetween={30}
          autoplay={{
            delay: autoplayDelay,
            disableOnInteraction: false,
          }}
          effect={"coverflow"}
          grabCursor={true}
          centeredSlides={true}
          loop={true}
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
              <div className="size-full rounded-3xl overflow-hidden aspect-square">
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
