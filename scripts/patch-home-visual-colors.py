from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    if text.count(old) != 1:
        raise SystemExit(f"{path}: expected exactly one target, got {text.count(old)}")
    p.write_text(text.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text()
    new, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one regex target, got {count}")
    p.write_text(new)


# 1) A camada visual da loja deve controlar tipografia, não bloquear cor de componentes.
replace_once(
    "src/storefront-minimal.css",
    '''.storefront-shell .font-display,
.storefront-shell h1,
.storefront-shell h2,
.storefront-shell h3,
.storefront-shell h4,
.storefront-shell h5,
.storefront-shell h6 {
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  letter-spacing: -0.035em;
  color: #251e23;
}
''',
    '''.storefront-shell .font-display,
.storefront-shell h1,
.storefront-shell h2,
.storefront-shell h3,
.storefront-shell h4,
.storefront-shell h5,
.storefront-shell h6 {
  font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  letter-spacing: -0.035em;
  /* A cor é deliberadamente herdada/definida pelo componente. Isso permite que
     Hero, Slider e demais blocos respeitem as cores escolhidas no editor. */
}
''',
)

# 2) Home pública: Hero principal deve respeitar exatamente as cores salvas no painel.
index = "src/routes/index.tsx"
replace_once(
    index,
    '''        {heroImageUrl && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/60 via-black/35 to-black/10" />
        )}
''',
    '''        {heroImageUrl && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundColor: hero.overlay_color ?? "#000000",
              opacity: Math.max(0, Math.min(1, hero.overlay_opacity ?? 0.45)),
            }}
          />
        )}
''',
)
replace_once(
    index,
    '''            <h1 className={`mt-8 font-display text-5xl leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl ${heroImageUrl ? "text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]" : "text-foreground"}`}>
              {hero.title_line1 ?? "Beleza rara,"}
              <br />
              <span className={heroImageUrl ? "text-champagne" : "bg-gradient-to-r from-plum via-primary to-champagne bg-clip-text text-transparent"}>
                {hero.title_highlight ?? "assinatura sua."}
              </span>
            </h1>
''',
    '''            <h1
              className={`mt-8 font-display text-5xl leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl ${heroImageUrl ? "drop-shadow-[0_2px_20px_rgba(0,0,0,0.5)]" : ""}`}
              style={{ color: hero.title_color ?? (heroImageUrl ? "#ffffff" : "#251e23") }}
            >
              {hero.title_line1 ?? "Beleza rara,"}
              <br />
              <span
                className={!hero.highlight_color && !heroImageUrl ? "bg-gradient-to-r from-plum via-primary to-champagne bg-clip-text text-transparent" : ""}
                style={hero.highlight_color ? { color: hero.highlight_color } : heroImageUrl ? { color: "#d7b47a" } : undefined}
              >
                {hero.title_highlight ?? "assinatura sua."}
              </span>
            </h1>
''',
)
replace_once(
    index,
    '''              <p className={`mt-6 max-w-xl text-base leading-relaxed sm:text-lg ${heroImageUrl ? "text-white/90" : "text-muted-foreground"}`}>
                {hero.subtitle}
              </p>
''',
    '''              <p
                className="mt-6 max-w-xl text-base leading-relaxed sm:text-lg"
                style={{ color: hero.subtitle_color ?? (heroImageUrl ? "rgba(255,255,255,.9)" : "#70636b") }}
              >
                {hero.subtitle}
              </p>
''',
)
replace_once(
    index,
    '''              <a
                href={primaryHref}
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-primary px-8 py-3.5 text-xs font-medium uppercase tracking-[0.28em] text-primary-foreground shadow-elegant transition hover:shadow-[0_20px_60px_-20px_var(--primary)]"
              >
''',
    '''              <a
                href={primaryHref}
                className="group relative inline-flex items-center justify-center overflow-hidden rounded-full px-8 py-3.5 text-xs font-medium uppercase tracking-[0.28em] shadow-elegant transition hover:shadow-[0_20px_60px_-20px_var(--primary)]"
                style={{
                  backgroundColor: hero.button_bg ?? "#c64b76",
                  color: hero.button_color ?? "#ffffff",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = hero.button_hover_bg ?? hero.button_bg ?? "#a84c69";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = hero.button_bg ?? "#c64b76";
                }}
              >
''',
)

# 3) Preview do Builder: usar os mesmos valores de cor/overlay que a Home publicada.
preview = "src/components/admin/HomeBuilderPreview.tsx"
hero_preview = r'''function HeroPreview({ value }: { value: NonNullable<HomeContent["hero"]> }) {
  const titleColor = value.title_color ?? (value.image_url ? "#ffffff" : "#251e23");
  const highlightColor = value.highlight_color ?? "#d7b47a";
  const subtitleColor = value.subtitle_color ?? (value.image_url ? "rgba(255,255,255,.9)" : "#70636b");
  const overlayOpacity = Math.max(0, Math.min(1, value.overlay_opacity ?? 0.4));
  const x = Math.max(0, Math.min(100, value.image_position_x ?? 50));
  const y = Math.max(0, Math.min(100, value.image_position_y ?? 50));
  return (
    <div
      className="relative flex min-h-[330px] items-center overflow-hidden bg-gradient-to-br from-[#f7efee] to-[#ead7dd] bg-cover px-7 py-10"
      style={value.image_url ? { backgroundImage: `url(${value.image_url})`, backgroundPosition: `${x}% ${y}%` } : undefined}
    >
      {value.image_url && <div className="absolute inset-0" style={{ backgroundColor: value.overlay_color ?? "#000000", opacity: overlayOpacity }} />}
      <div className="relative z-10 max-w-[72%]">
        {value.badge && <span className="rounded-full border border-[#d7b47a]/60 px-3 py-1 text-[8px] uppercase tracking-[0.22em]" style={{ color: titleColor }}>{value.badge}</span>}
        <h2 className="mt-4 text-3xl font-semibold leading-[1.02]" style={{ color: titleColor }}>
          {value.title_line1 || "Título principal"}<br />
          <span style={{ color: highlightColor }}>{value.title_highlight || "destaque"}</span>
        </h2>
        {value.subtitle && <p className="mt-4 text-[11px] leading-5" style={{ color: subtitleColor }}>{value.subtitle}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {value.cta_primary_label && <span className="rounded-full px-4 py-2 text-[8px] font-semibold uppercase tracking-wider" style={{ backgroundColor: value.button_bg ?? "#c64b76", color: value.button_color ?? "#ffffff" }}>{value.cta_primary_label}</span>}
          {value.cta_secondary_label && <span className="rounded-full border border-current px-4 py-2 text-[8px] font-semibold uppercase tracking-wider" style={{ color: titleColor }}>{value.cta_secondary_label}</span>}
        </div>
      </div>
    </div>
  );
}

function SlidePreview'''
regex_once(
    preview,
    r'function HeroPreview\(\{ value \}: \{ value: NonNullable<HomeContent\["hero"\]> \}\) \{.*?\n\}\n\nfunction SlidePreview',
    hero_preview,
)
slide_preview = r'''function SlidePreview({ slide, index }: { slide: NonNullable<NonNullable<HomeContent["hero_slider"]>["slides"]>[number] | undefined; index: number }) {
  if (!slide) return <EmptyPreview text="Selecione ou crie um slide." />;
  const align = slide.align ?? "center";
  const alignment = align === "left" ? "items-start text-left" : align === "right" ? "items-end text-right ml-auto" : "items-center text-center mx-auto";
  const titleColor = slide.title_color ?? "#ffffff";
  const subtitleColor = slide.subtitle_color ?? "rgba(255,255,255,.88)";
  const overlayOpacity = Math.max(0, Math.min(1, slide.overlay_opacity ?? 0.48));
  const x = Math.max(0, Math.min(100, slide.image_position_x ?? 50));
  const y = Math.max(0, Math.min(100, slide.image_position_y ?? 50));
  return (
    <div className="relative flex min-h-[330px] items-center bg-[#ead7dd] bg-cover px-7 py-10" style={slide.image_url ? { backgroundImage: `url(${slide.image_url})`, backgroundPosition: `${x}% ${y}%` } : undefined}>
      <div className="absolute inset-0" style={{ backgroundColor: slide.overlay_color ?? "#000000", opacity: overlayOpacity }} />
      <div className={`relative z-10 flex max-w-[75%] flex-col ${alignment}`}>
        <p className="text-[8px] uppercase tracking-[0.25em]" style={{ color: subtitleColor }}>Slide {index + 1}</p>
        <h2 className="mt-2 text-3xl font-semibold leading-tight" style={{ color: titleColor }}>{slide.title || "Título do slide"}</h2>
        {slide.subtitle && <p className="mt-3 text-[11px] leading-5" style={{ color: subtitleColor }}>{slide.subtitle}</p>}
        {slide.cta_label && <span className="mt-5 rounded-full px-4 py-2 text-[8px] font-semibold uppercase tracking-wider" style={{ backgroundColor: slide.button_bg ?? "#c64b76", color: slide.button_color ?? "#ffffff" }}>{slide.cta_label}</span>}
      </div>
    </div>
  );
}

function CategoriesPreview'''
regex_once(
    preview,
    r'function SlidePreview\(\{ slide, index \}:.*?\n\}\n\nfunction CategoriesPreview',
    slide_preview,
)

# 4) Editor visual: presets da paleta da loja + cor específica do destaque do Hero.
editor = "src/routes/_authenticated/admin.home-visual.tsx"
replace_once(
    editor,
    '''type VisualBlockData = Record<string, unknown> & {
''',
    '''const HOME_COLOR_PRESETS = [
  { label: "Branco", value: "#ffffff" },
  { label: "Texto", value: "#251e23" },
  { label: "Berry", value: "#c64b76" },
  { label: "Rosa queimado", value: "#a84c69" },
  { label: "Ameixa", value: "#6d405f" },
  { label: "Lavanda", value: "#a890ae" },
  { label: "Champagne", value: "#d7b47a" },
  { label: "Fundo", value: "#fff8f7" },
] as const;

type VisualBlockData = Record<string, unknown> & {
''',
)
replace_once(
    editor,
    '''{ title: "Novo destaque", subtitle: "", cta_label: "Ver produtos", cta_href: "/products", align: "left", image_position_x: 50, image_position_y: 50, overlay_opacity: .45, height_desktop: 640, height_mobile: 500 }
''',
    '''{ title: "Novo destaque", subtitle: "", cta_label: "Ver produtos", cta_href: "/products", align: "left", image_position_x: 50, image_position_y: 50, overlay_color: "#000000", overlay_opacity: .45, title_color: "#ffffff", subtitle_color: "#fff8f7", button_bg: "#c64b76", button_color: "#ffffff", button_hover_bg: "#a84c69", height_desktop: 640, height_mobile: 500 }
''',
)
hero_fields = r'''function HeroFields({ value, patch }: { value: NonNullable<HomeContent["hero"]>; patch: (p: Partial<NonNullable<HomeContent["hero"]>>) => void }) {
  return <div className="space-y-4 rounded-2xl border border-border bg-card p-5"><div className="grid gap-4 md:grid-cols-2"><Field label="Badge"><Input value={value.badge ?? ""} onChange={(e) => patch({ badge: e.target.value })} /></Field><Field label="Título"><Input value={value.title_line1 ?? ""} onChange={(e) => patch({ title_line1: e.target.value })} /></Field><Field label="Destaque do título"><Input value={value.title_highlight ?? ""} onChange={(e) => patch({ title_highlight: e.target.value })} /></Field><Field label="Subtítulo"><Input value={value.subtitle ?? ""} onChange={(e) => patch({ subtitle: e.target.value })} /></Field><Field label="Texto do botão"><Input value={value.cta_primary_label ?? ""} onChange={(e) => patch({ cta_primary_label: e.target.value })} /></Field><Field label="Link"><Input value={value.cta_primary_href ?? ""} onChange={(e) => patch({ cta_primary_href: e.target.value })} /></Field></div><HomeImageUpload label="Imagem desktop" value={value.image_url} onChange={(v) => patch({ image_url: v })} /><HomeImageUpload label="Imagem mobile" value={value.image_mobile_url} onChange={(v) => patch({ image_mobile_url: v })} /><VisualControls value={value} patch={patch} /><div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-4 md:grid-cols-2"><ColorField label="Cor do destaque do título" value={value.highlight_color ?? "#d7b47a"} onChange={(v) => patch({ highlight_color: v })} /><div className="flex items-end text-xs text-muted-foreground">Use Champagne para o padrão da marca ou escolha qualquer cor personalizada.</div></div></div>;
}

function SecondaryHeroEditor'''
regex_once(
    editor,
    r'function HeroFields\(\{ value, patch \}:.*?\n\}\n\nfunction SecondaryHeroEditor',
    hero_fields,
)
color_field = r'''function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const pickerValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return <Field label={label}><div className="space-y-2"><div className="flex gap-2"><input type="color" value={pickerValue} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded border border-input" aria-label={`${label}: seletor de cor`} /><Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#ffffff" /></div><div className="flex flex-wrap gap-1.5" aria-label={`Cores rápidas para ${label}`}>{HOME_COLOR_PRESETS.map((preset) => <button key={preset.value} type="button" title={`${preset.label} ${preset.value}`} aria-label={`${preset.label} ${preset.value}`} onClick={() => onChange(preset.value)} className="h-6 w-6 rounded-full border border-border shadow-sm transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/40" style={{ backgroundColor: preset.value }} />)}</div></div></Field>;
}'''
regex_once(
    editor,
    r'function ColorField\(\{ label, value, onChange \}:.*?\n?$',
    color_field,
)

print("Home visual color consistency patch applied")
