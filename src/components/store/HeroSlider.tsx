import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { HeroSlide } from "@/lib/marketing";

export function HeroSlider({
  slides,
  autoplayMs = 6000,
}: {
  slides: HeroSlide[];
  autoplayMs?: number;
}) {
  const [[idx, dir], setState] = useState<[number, number]>([0, 1]);
  const count = slides.length;

  useEffect(() => {
    if (count === 0) return;
    setState(([current, currentDir]) => [Math.min(current, count - 1), currentDir]);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || autoplayMs <= 0) return;
    const t = setInterval(() => {
      setState(([i]) => [(i + 1) % count, 1]);
    }, autoplayMs);
    return () => clearInterval(t);
  }, [count, autoplayMs]);

  if (count === 0) return null;

  const safeIdx = Math.min(idx, count - 1);
  const go = (n: number) => {
    const next = (n + count) % count;
    setState(([i]) => [next, next > i ? 1 : -1]);
  };

  const slide = slides[safeIdx];
  const align = slide.align ?? "center";
  const alignCls =
    align === "left"
      ? "items-start text-left"
      : align === "right"
        ? "items-end text-right"
        : "items-center text-center";

  return (
    <section
      className="relative w-full overflow-hidden bg-secondary min-h-[420px] h-[70vh] max-h-[640px] lg:min-h-[500px]"
      aria-label="Destaques"
    >
      <AnimatePresence initial={false} custom={dir} mode="popLayout">
        <motion.div
          key={safeIdx}
          custom={dir}
          initial={{ opacity: 0, x: dir > 0 ? 80 : -80, scale: 1.05 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: dir > 0 ? -80 : 80, scale: 1.02 }}
          transition={{
            opacity: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
            x: { duration: 1.1, ease: [0.22, 1, 0.36, 1] },
            scale: { duration: 6, ease: "linear" },
          }}
          className="absolute inset-0"
        >
          {slide.image_url ? (
            <motion.div
              className="absolute inset-0"
              style={{
                backgroundImage: `url(${slide.image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
              initial={{ scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: Math.max(autoplayMs, 4000) / 1000, ease: "linear" }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-plum via-berry to-primary" />
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-black/10" />
          <div className="relative z-10 mx-auto flex h-full max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className={`flex h-full w-full flex-col justify-center gap-5 ${alignCls}`}>
              {slide.title ? (
                <motion.h2
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-2xl font-display text-4xl leading-tight text-white sm:text-5xl lg:text-6xl"
                >
                  {slide.title}
                </motion.h2>
              ) : null}
              {slide.subtitle ? (
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="max-w-xl text-base text-white/85 sm:text-lg"
                >
                  {slide.subtitle}
                </motion.p>
              ) : null}
              {slide.cta_label && slide.cta_href ? (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.7, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
                >
                  <a
                    href={slide.cta_href}
                    className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3.5 text-xs font-medium uppercase tracking-[0.28em] text-primary-foreground shadow-elegant transition hover:opacity-90 hover:scale-105"
                  >
                    {slide.cta_label}
                  </a>
                </motion.div>
              ) : null}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => go(safeIdx - 1)}
            className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 hover:scale-110"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => go(safeIdx + 1)}
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60 hover:scale-110"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3">
            {slides.map((_, i) => {
              const active = i === safeIdx;
              return (
                <button
                  key={i}
                  type="button"
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => go(i)}
                  className={`relative h-2 overflow-hidden rounded-full transition-all duration-500 ${
                    active ? "w-12 bg-white/25" : "w-2 bg-white/40 hover:bg-white/70"
                  }`}
                >
                  {active && autoplayMs > 0 && (
                    <motion.span
                      key={`fill-${safeIdx}`}
                      className="absolute inset-y-0 left-0 rounded-full bg-champagne"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: autoplayMs / 1000, ease: "linear" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
