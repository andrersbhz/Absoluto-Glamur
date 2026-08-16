import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { HeroSlide } from "@/lib/marketing";

export function HeroSlider({ slides, autoplayMs = 6000 }: { slides: HeroSlide[]; autoplayMs?: number }) {
  const [[idx, dir], setState] = useState<[number, number]>([0, 1]);
  const count = slides.length;

  useEffect(() => {
    if (count === 0) return;
    setState(([current, currentDir]) => [Math.min(current, count - 1), currentDir]);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || autoplayMs <= 0) return;
    const t = setInterval(() => setState(([i]) => [(i + 1) % count, 1]), autoplayMs);
    return () => clearInterval(t);
  }, [count, autoplayMs]);

  if (count === 0) return null;
  const safeIdx = Math.min(idx, count - 1);
  const slide = slides[safeIdx];
  const go = (n: number) => {
    const next = (n + count) % count;
    setState(([i]) => [next, next > i ? 1 : -1]);
  };

  const align = slide.align ?? "center";
  const alignCls = align === "left" ? "items-start text-left" : align === "right" ? "items-end text-right" : "items-center text-center";
  const vertical = slide.vertical_align ?? "center";
  const verticalCls = vertical === "top" ? "justify-start" : vertical === "bottom" ? "justify-end" : "justify-center";
  const x = Math.max(0, Math.min(100, slide.image_position_x ?? 50));
  const y = Math.max(0, Math.min(100, slide.image_position_y ?? 50));
  const overlayOpacity = Math.max(0, Math.min(1, slide.overlay_opacity ?? 0.48));
  const desktopHeight = Math.max(360, Math.min(900, slide.height_desktop ?? 640));
  const mobileHeight = Math.max(320, Math.min(760, slide.height_mobile ?? 500));
  const titleDesktop = Math.max(24, Math.min(96, slide.title_size_desktop ?? 60));
  const titleMobile = Math.max(22, Math.min(64, slide.title_size_mobile ?? 38));
  const subtitleDesktop = Math.max(12, Math.min(40, slide.subtitle_size_desktop ?? 18));
  const subtitleMobile = Math.max(12, Math.min(32, slide.subtitle_size_mobile ?? 16));

  return (
    <section
      className="relative w-full overflow-hidden bg-secondary h-[var(--hero-height-mobile)] md:h-[var(--hero-height-desktop)]"
      style={{
        ["--hero-height-mobile" as string]: `${mobileHeight}px`,
        ["--hero-height-desktop" as string]: `${desktopHeight}px`,
      }}
      aria-label="Destaques"
    >
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        <motion.div
          key={safeIdx}
          custom={dir}
          initial={{ opacity: 0, x: dir > 0 ? 80 : -80, scale: 1.03 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: dir > 0 ? -80 : 80, scale: 1.01 }}
          transition={{ opacity: { duration: 0.7 }, x: { duration: 0.9 }, scale: { duration: 5, ease: "linear" } }}
          className="absolute inset-0"
        >
          {slide.image_url || slide.image_mobile_url ? (
            <picture className="absolute inset-0 block h-full w-full">
              {slide.image_mobile_url ? <source media="(max-width: 767px)" srcSet={slide.image_mobile_url} /> : null}
              <img
                src={slide.image_url || slide.image_mobile_url}
                alt=""
                className="h-full w-full object-cover"
                style={{ objectPosition: `${x}% ${y}%` }}
              />
            </picture>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-plum via-berry to-primary" />
          )}
          <div className="absolute inset-0" style={{ backgroundColor: slide.overlay_color ?? "#000000", opacity: overlayOpacity }} />
          <div className="relative z-10 mx-auto flex h-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className={`flex h-full w-full flex-col gap-5 ${verticalCls} ${alignCls}`}>
              <div className="flex w-full flex-col gap-5" style={{ maxWidth: slide.content_max_width ?? 720, alignItems: align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center" }}>
                {slide.title ? (
                  <motion.h2
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1 }}
                    className="font-display leading-tight text-[length:var(--title-mobile)] md:text-[length:var(--title-desktop)]"
                    style={{ color: slide.title_color ?? "#ffffff", ["--title-mobile" as string]: `${titleMobile}px`, ["--title-desktop" as string]: `${titleDesktop}px` }}
                  >{slide.title}</motion.h2>
                ) : null}
                {slide.subtitle ? (
                  <motion.p
                    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
                    className="leading-relaxed text-[length:var(--subtitle-mobile)] md:text-[length:var(--subtitle-desktop)]"
                    style={{ color: slide.subtitle_color ?? "rgba(255,255,255,.88)", ["--subtitle-mobile" as string]: `${subtitleMobile}px`, ["--subtitle-desktop" as string]: `${subtitleDesktop}px` }}
                  >{slide.subtitle}</motion.p>
                ) : null}
                {slide.cta_label && slide.cta_href ? (
                  <motion.a
                    href={slide.cta_href}
                    target={slide.cta_target ?? "_self"}
                    rel={slide.cta_target === "_blank" ? "noreferrer" : undefined}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
                    className="inline-flex items-center justify-center px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.24em] shadow-elegant transition hover:scale-105"
                    style={{ backgroundColor: slide.button_bg ?? "#c64b76", color: slide.button_color ?? "#ffffff", borderRadius: slide.button_radius ?? 999 }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = slide.button_hover_bg ?? slide.button_bg ?? "#a83c64"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = slide.button_bg ?? "#c64b76"; }}
                  >{slide.cta_label}</motion.a>
                ) : null}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {count > 1 && <>
        <button type="button" aria-label="Anterior" onClick={() => go(safeIdx - 1)} className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" aria-label="Próximo" onClick={() => go(safeIdx + 1)} className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60"><ChevronRight className="h-5 w-5" /></button>
        <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3">
          {slides.map((_, i) => <button key={i} type="button" aria-label={`Slide ${i + 1}`} onClick={() => go(i)} className={`relative h-2 overflow-hidden rounded-full transition-all ${i === safeIdx ? "w-12 bg-white/25" : "w-2 bg-white/40"}`}>{i === safeIdx && autoplayMs > 0 ? <motion.span className="absolute inset-y-0 left-0 rounded-full bg-champagne" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: autoplayMs / 1000, ease: "linear" }} /> : null}</button>)}
        </div>
      </>}
    </section>
  );
}
