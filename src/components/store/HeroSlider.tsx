import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { HeroSlide } from "@/lib/marketing";

export function HeroSlider({
  slides,
  autoplayMs = 6000,
}: {
  slides: HeroSlide[];
  autoplayMs?: number;
}) {
  const [idx, setIdx] = useState(0);
  const count = slides.length;

  useEffect(() => {
    if (count <= 1 || autoplayMs <= 0) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), autoplayMs);
    return () => clearInterval(t);
  }, [count, autoplayMs]);

  if (count === 0) return null;

  const go = (n: number) => setIdx((n + count) % count);

  return (
    <section
      className="relative w-full overflow-hidden bg-secondary"
      style={{ height: 500 }}
      aria-label="Destaques"
    >
      {slides.map((s, i) => {
        const align = s.align ?? "center";
        const alignCls =
          align === "left"
            ? "items-start text-left"
            : align === "right"
              ? "items-end text-right"
              : "items-center text-center";
        return (
          <div
            key={i}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === idx ? 1 : 0, pointerEvents: i === idx ? "auto" : "none" }}
            aria-hidden={i !== idx}
          >
            {s.image_url ? (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${s.image_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-plum via-berry to-primary" />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-black/10" />
            <div className="relative z-10 mx-auto flex h-full max-w-7xl px-4 sm:px-6 lg:px-8">
              <div className={`flex h-full w-full flex-col justify-center gap-5 ${alignCls}`}>
                {s.title ? (
                  <h2 className="max-w-2xl font-display text-4xl leading-tight text-white sm:text-5xl lg:text-6xl">
                    {s.title}
                  </h2>
                ) : null}
                {s.subtitle ? (
                  <p className="max-w-xl text-base text-white/85 sm:text-lg">{s.subtitle}</p>
                ) : null}
                {s.cta_label && s.cta_href ? (
                  <div>
                    <a
                      href={s.cta_href}
                      className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3.5 text-xs font-medium uppercase tracking-[0.28em] text-primary-foreground shadow-elegant transition hover:opacity-90"
                    >
                      {s.cta_label}
                    </a>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => go(idx - 1)}
            className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo"
            onClick={() => go(idx + 1)}
            className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white backdrop-blur transition hover:bg-black/60"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Slide ${i + 1}`}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx ? "w-8 bg-champagne" : "w-4 bg-white/50 hover:bg-white/80"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
