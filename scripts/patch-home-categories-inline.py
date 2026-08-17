from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 occurrence, found {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


# Public Home: category block is one horizontal line and legacy blocks default to all categories.
index_path = "src/routes/index.tsx"
replace_once(
    index_path,
    '''type StructureBlockData = {
  mode?: string;
  categories?: string[];
  category_slug?: string;
  limit?: number;
  columns?: number;
};''',
    '''type StructureBlockData = {
  mode?: string;
  categories?: string[];
  category_slug?: string;
  limit?: number;
  columns?: number;
  layout?: "inline" | "grid";
  align?: "left" | "center";
  pill_style?: "outline" | "soft" | "solid";
  show_heading?: boolean;
};''',
)
replace_once(
    index_path,
    '''    limit: typeof raw.limit === "number" && Number.isFinite(raw.limit) ? raw.limit : undefined,
    columns: typeof raw.columns === "number" && Number.isFinite(raw.columns) ? raw.columns : undefined,
  };''',
    '''    limit: typeof raw.limit === "number" && Number.isFinite(raw.limit) ? raw.limit : undefined,
    columns: typeof raw.columns === "number" && Number.isFinite(raw.columns) ? raw.columns : undefined,
    layout: raw.layout === "inline" || raw.layout === "grid" ? raw.layout : undefined,
    align: raw.align === "left" || raw.align === "center" ? raw.align : undefined,
    pill_style: raw.pill_style === "soft" || raw.pill_style === "solid" || raw.pill_style === "outline" ? raw.pill_style : undefined,
    show_heading: typeof raw.show_heading === "boolean" ? raw.show_heading : undefined,
  };''',
)
replace_once(
    index_path,
    '''  const data = blockData(block);
  const slugs = selectedSlugs(data);
  let visible = categories;
  if (data.mode === "selected" && slugs.length > 0) {
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    visible = slugs.map((slug) => bySlug.get(slug)).filter((value): value is (typeof categories)[number] => !!value);
  }
  const limit = clampInt(data.limit, visible.length || categories.length, 1, 50);
  return <CategoryGridSection categories={visible.slice(0, limit)} />;
}

function CategoryGridSection({
  categories,
}: {
  categories: Array<{ id: string; name: string; slug: string }>;
}) {
  if (categories.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <GoldRule />
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {categories.map((category) => (
          <Link
            key={category.id}
            to="/products"
            search={{ category: category.slug } as never}
            className="rounded-full border border-border bg-card px-5 py-2 text-xs uppercase tracking-[0.22em] text-foreground shadow-soft transition hover:border-champagne hover:text-primary"
          >
            {category.name}
          </Link>
        ))}
      </div>
    </section>
  );
}''',
    '''  const data = blockData(block);
  const slugs = selectedSlugs(data);
  const inlineConfigured = data.layout === "inline";
  let visible = categories;

  // Legacy category_grid blocks did not have a layout flag. Treat them as the new
  // "all categories" inline block so an old two-item selection cannot keep the Home broken.
  if (inlineConfigured && data.mode === "selected" && slugs.length > 0) {
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    visible = slugs.map((slug) => bySlug.get(slug)).filter((value): value is (typeof categories)[number] => !!value);
  }

  const limit = inlineConfigured
    ? clampInt(data.limit, visible.length || categories.length, 1, 50)
    : visible.length;

  return (
    <CategoryGridSection
      categories={visible.slice(0, limit)}
      title={block.title ?? undefined}
      subtitle={block.subtitle ?? undefined}
      showHeading={data.show_heading === true}
      align={data.align ?? "center"}
      pillStyle={data.pill_style ?? "outline"}
    />
  );
}

function CategoryGridSection({
  categories,
  title,
  subtitle,
  showHeading = false,
  align = "center",
  pillStyle = "outline",
}: {
  categories: Array<{ id: string; name: string; slug: string }>;
  title?: string;
  subtitle?: string;
  showHeading?: boolean;
  align?: "left" | "center";
  pillStyle?: "outline" | "soft" | "solid";
}) {
  if (categories.length === 0) return null;
  const pillClass = pillStyle === "solid"
    ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
    : pillStyle === "soft"
      ? "border-transparent bg-secondary text-foreground hover:border-champagne hover:text-primary"
      : "border-border bg-card text-foreground hover:border-champagne hover:text-primary";

  return (
    <section className="mx-auto max-w-7xl overflow-hidden px-4 py-8 sm:px-6 lg:px-8">
      {showHeading && (title || subtitle) ? (
        <div className={align === "left" ? "text-left" : "text-center"}>
          {subtitle ? <p className="text-[11px] uppercase tracking-[0.3em] text-champagne">{subtitle}</p> : null}
          {title ? <h2 className="mt-2 font-display text-3xl text-foreground sm:text-4xl">{title}</h2> : null}
          {align === "center" ? <GoldRule /> : null}
        </div>
      ) : (
        <GoldRule />
      )}
      <div
        className={`mt-6 flex w-full flex-nowrap items-center gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${align === "center" ? "lg:justify-center" : "justify-start"}`}
        aria-label="Categorias da loja"
      >
        {categories.map((category) => (
          <Link
            key={category.id}
            to="/products"
            search={{ category: category.slug } as never}
            className={`shrink-0 whitespace-nowrap rounded-full border px-5 py-2.5 text-xs uppercase tracking-[0.2em] shadow-soft transition ${pillClass}`}
          >
            {category.name}
          </Link>
        ))}
      </div>
    </section>
  );
}''',
)

# Home Page Builder: category_grid becomes a first-class editable block.
admin_path = "src/routes/_authenticated/admin.home.tsx"
replace_once(
    admin_path,
    '''type EditableBlockData = Record<string, unknown> & {
  image_url?: string;
  href?: string;
  cta_href?: string;
  cta_label?: string;
  body?: string;
  slug?: string;
  collection_slug?: string;
  text_align?: "left" | "center" | "right";
};''',
    '''type EditableBlockData = Record<string, unknown> & {
  image_url?: string;
  href?: string;
  cta_href?: string;
  cta_label?: string;
  body?: string;
  slug?: string;
  collection_slug?: string;
  text_align?: "left" | "center" | "right";
  mode?: "all" | "selected";
  categories?: string[];
  limit?: number;
  layout?: "inline" | "grid";
  align?: "left" | "center";
  pill_style?: "outline" | "soft" | "solid";
  show_heading?: boolean;
};''',
)
replace_once(
    admin_path,
    'type AddableBlock = "banner" | "hero" | "collection" | "text";',
    'type AddableBlock = "banner" | "hero" | "collection" | "text" | "category_grid";',
)
replace_once(
    admin_path,
    '''const ADDABLE_BLOCKS: Array<{ kind: AddableBlock; label: string; description: string }> = [
  { kind: "banner", label: "Banner de imagem", description: "Banner clicável usando imagem própria ou URL." },
  { kind: "hero", label: "Hero complementar", description: "Título, subtítulo, imagem e CTA em destaque." },
  { kind: "collection", label: "Coleção destacada", description: "Vitrine conectada a uma coleção existente." },
  { kind: "text", label: "Texto editorial", description: "Bloco simples para mensagem, manifesto curto ou apoio." },
];

const KNOWN_PUBLIC_KINDS = new Set(["banner", "hero", "collection", "text"]);''',
    '''const ADDABLE_BLOCKS: Array<{ kind: AddableBlock; label: string; description: string }> = [
  { kind: "banner", label: "Banner de imagem", description: "Banner clicável usando imagem própria ou URL." },
  { kind: "hero", label: "Hero complementar", description: "Título, subtítulo, imagem e CTA em destaque." },
  { kind: "collection", label: "Coleção destacada", description: "Vitrine conectada a uma coleção existente." },
  { kind: "text", label: "Texto editorial", description: "Bloco simples para mensagem, manifesto curto ou apoio." },
  { kind: "category_grid", label: "Categorias em linha", description: "Exibe todas as categorias em uma única faixa horizontal responsiva." },
];

const KNOWN_PUBLIC_KINDS = new Set(["banner", "hero", "collection", "text", "category_grid"]);''',
)
replace_once(
    admin_path,
    '''function cloneBlock(block: HomepageBlock): BlockDraft {
  return {
    ...block,
    data: { ...((block.data ?? {}) as EditableBlockData) },
  };
}''',
    '''function cloneBlock(block: HomepageBlock): BlockDraft {
  const rawData = { ...((block.data ?? {}) as EditableBlockData) };
  const data: EditableBlockData = block.kind === "category_grid"
    ? {
        ...rawData,
        // Old category blocks are upgraded in the draft to the requested all-category inline layout.
        mode: rawData.layout === "inline" && rawData.mode === "selected" ? "selected" : "all",
        layout: "inline",
        limit: typeof rawData.limit === "number" && Number.isFinite(rawData.limit) ? rawData.limit : 50,
        align: rawData.align === "left" ? "left" : "center",
        pill_style: rawData.pill_style === "soft" || rawData.pill_style === "solid" ? rawData.pill_style : "outline",
        show_heading: rawData.show_heading === true,
      }
    : rawData;
  return { ...block, data };
}''',
)
replace_once(
    admin_path,
    '''      const defaults: Record<AddableBlock, { title: string; subtitle: string | null; data: EditableBlockData }> = {
        banner: { title: "Novo banner", subtitle: null, data: { image_url: "", href: "/products" } },
        hero: { title: "Novo destaque", subtitle: "", data: { image_url: "", cta_label: "Ver produtos", cta_href: "/products" } },
        collection: { title: "Coleção em destaque", subtitle: "", data: { slug: collections[0]?.slug ?? "" } },
        text: { title: "Novo conteúdo", subtitle: null, data: { body: "" } },
      };''',
    '''      const defaults: Record<AddableBlock, { title: string; subtitle: string | null; data: EditableBlockData }> = {
        banner: { title: "Novo banner", subtitle: null, data: { image_url: "", href: "/products" } },
        hero: { title: "Novo destaque", subtitle: "", data: { image_url: "", cta_label: "Ver produtos", cta_href: "/products" } },
        collection: { title: "Coleção em destaque", subtitle: "", data: { slug: collections[0]?.slug ?? "" } },
        text: { title: "Novo conteúdo", subtitle: null, data: { body: "" } },
        category_grid: {
          title: "Categorias",
          subtitle: "Explore por categoria",
          data: { mode: "all", categories: [], limit: 50, layout: "inline", align: "center", pill_style: "outline", show_heading: false },
        },
      };''',
)
replace_once(
    admin_path,
    '''}) {
  const known = KNOWN_PUBLIC_KINDS.has(block.kind);
  return (''',
    '''}) {
  const known = KNOWN_PUBLIC_KINDS.has(block.kind);
  const categoryMode = block.kind === "category_grid" && block.data.layout === "inline" && block.data.mode === "selected" ? "selected" : "all";
  const selectedCategorySlugs = Array.isArray(block.data.categories)
    ? block.data.categories.filter((value): value is string => typeof value === "string")
    : [];

  function toggleCategorySlug(slug: string, checked: boolean) {
    const next = checked
      ? [...selectedCategorySlugs.filter((value) => value !== slug), slug]
      : selectedCategorySlugs.filter((value) => value !== slug);
    onPatchData({ categories: next, mode: "selected", layout: "inline" });
  }

  return (''',
)
replace_once(
    admin_path,
    '''        {block.kind === "category_grid" && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Categorias vinculadas neste bloco existente</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.filter((category) => Array.isArray((block.data as { categories?: string[] }).categories) && (block.data as { categories?: string[] }).categories?.includes(category.slug)).map((category) => (
                <Badge key={category.id} variant="secondary">{category.name}</Badge>
              ))}
            </div>
          </div>
        )}''',
    '''        {block.kind === "category_grid" && (
          <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Categorias em linha</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">No desktop ficam em uma única linha; no celular a faixa desliza horizontalmente sem quebrar os botões.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quais categorias exibir">
                <select
                  value={categoryMode}
                  onChange={(event) => onPatchData({ mode: event.target.value === "selected" ? "selected" : "all", layout: "inline" })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="all">Todas as categorias</option>
                  <option value="selected">Somente selecionadas</option>
                </select>
              </Field>
              <Field label="Máximo de categorias">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={Number(block.data.limit ?? 50)}
                  onChange={(event) => onPatchData({ limit: Math.max(1, Math.min(50, Number(event.target.value) || 1)), layout: "inline" })}
                />
              </Field>
              <Field label="Alinhamento no desktop">
                <select
                  value={block.data.align === "left" ? "left" : "center"}
                  onChange={(event) => onPatchData({ align: event.target.value === "left" ? "left" : "center", layout: "inline" })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="center">Centralizado</option>
                  <option value="left">À esquerda</option>
                </select>
              </Field>
              <Field label="Estilo dos botões">
                <select
                  value={block.data.pill_style === "soft" || block.data.pill_style === "solid" ? block.data.pill_style : "outline"}
                  onChange={(event) => onPatchData({ pill_style: event.target.value as "outline" | "soft" | "solid", layout: "inline" })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="outline">Contorno elegante</option>
                  <option value="soft">Fundo suave</option>
                  <option value="solid">Cor principal</option>
                </select>
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={block.data.show_heading === true}
                onChange={(event) => onPatchData({ show_heading: event.target.checked, layout: "inline" })}
              />
              Exibir título e subtítulo acima das categorias
            </label>

            {categoryMode === "selected" && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Selecione as categorias</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {categories.map((category) => (
                    <label key={category.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={selectedCategorySlugs.includes(category.slug)}
                        onChange={(event) => toggleCategorySlug(category.slug, event.target.checked)}
                      />
                      <span className="truncate">{category.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg bg-background px-3 py-2 text-[11px] leading-5 text-muted-foreground">
              A ordem dos botões segue <strong className="text-foreground">Categorias e posição</strong>. Com “Todas as categorias”, novas categorias entram automaticamente neste bloco.
            </div>
          </div>
        )}''',
)
replace_once(admin_path, 'category_grid: "Grade / benefícios",', 'category_grid: "Categorias em linha",')

# Visual preview: category block must mirror the single-row public layout.
preview_path = "src/components/admin/HomeBuilderPreview.tsx"
replace_once(
    preview_path,
    '''  if (block.kind === "category_grid") {
    const selected = data.mode === "all"
      ? categories.map((category) => category.slug)
      : Array.isArray(data.categories) ? data.categories : [];
    const names = selected.map((slug: string) => categories.find((category) => category.slug === slug)?.name ?? slug);
    return <div className="p-6"><p className="text-[8px] uppercase tracking-[0.2em] text-[#a84c69]">{block.subtitle || "Explore por categoria"}</p><p className="mt-1 text-2xl font-semibold text-[#251e23]">{block.title || "Categorias"}</p><div className="mt-4 flex flex-wrap gap-2">{names.map((name: string) => <span key={name} className="rounded-full border border-[#e9dddf] bg-white px-3 py-2 text-[9px]">{name}</span>)}</div></div>;
  }''',
    '''  if (block.kind === "category_grid") {
    const inlineConfigured = data.layout === "inline";
    const selected = inlineConfigured && data.mode === "selected" && Array.isArray(data.categories)
      ? data.categories
      : categories.map((category) => category.slug);
    const limit = inlineConfigured && typeof data.limit === "number" ? Math.max(1, Math.min(50, data.limit)) : selected.length;
    const names = selected.slice(0, limit).map((slug: string) => categories.find((category) => category.slug === slug)?.name ?? slug);
    const pillClass = data.pill_style === "solid"
      ? "border-[#c64b76] bg-[#c64b76] text-white"
      : data.pill_style === "soft"
        ? "border-transparent bg-[#f7efee] text-[#251e23]"
        : "border-[#e9dddf] bg-white text-[#251e23]";
    return (
      <div className="overflow-hidden p-6">
        {data.show_heading === true ? (
          <div className={data.align === "left" ? "text-left" : "text-center"}>
            <p className="text-[8px] uppercase tracking-[0.2em] text-[#a84c69]">{block.subtitle || "Explore por categoria"}</p>
            <p className="mt-1 text-2xl font-semibold text-[#251e23]">{block.title || "Categorias"}</p>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-[#d7b47a]"><span className="h-px w-8 bg-[#d7b47a]" /><span>◇</span><span className="h-px w-8 bg-[#d7b47a]" /></div>
        )}
        <div className={`mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${data.align === "left" ? "justify-start" : "lg:justify-center"}`}>
          {names.map((name: string) => <span key={name} className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-[9px] uppercase tracking-[0.14em] ${pillClass}`}>{name}</span>)}
        </div>
      </div>
    );
  }''',
)

print("Home category inline Builder patch applied successfully.")
