import { Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { LOCALE_LIST, useI18n, type Locale } from "@/lib/i18n";

/**
 * Seletor discreto de idioma no header da loja.
 * Fase 3 adiciona país e moeda ao mesmo controle.
 */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const current = LOCALE_LIST.find((l) => l.code === locale) ?? LOCALE_LIST[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={t("nav.language")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="store-icon-button flex items-center gap-1 rounded-full p-2.5 text-xs"
      >
        <Globe className="h-[18px] w-[18px]" />
        <span className="hidden sm:inline">{current.flag}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 z-50 mt-2 w-52 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {LOCALE_LIST.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === locale}
                onClick={() => {
                  setOpen(false);
                  setLocale(l.code as Locale);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-secondary/60 ${
                  l.code === locale ? "font-medium text-primary" : "text-foreground"
                }`}
              >
                <span>{l.flag}</span>
                <span className="flex-1">{l.label}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {l.currency}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
