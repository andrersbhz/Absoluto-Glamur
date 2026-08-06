import { variantAttrValues, variantAttributes, variantStock, type ProductVariantDetail } from "@/lib/catalog";

type Props = {
  variants: ProductVariantDetail[];
  selectedId: string | undefined;
  onSelect: (variantId: string) => void;
};

/**
 * Seletor de variações 100% dinâmico: os atributos e valores vêm exclusivamente
 * dos SKUs reais importados. Combinações inexistentes ou sem estoque ficam desabilitadas.
 */
export function VariantSelector({ variants, selectedId, onSelect }: Props) {
  const attributes = variantAttributes(variants);
  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return null;

  // Sem atributos estruturados (produtos legados): lista simples de SKUs.
  if (attributes.length === 0) {
    if (variants.length <= 1) return null;
    return (
      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">Escolha uma variação</p>
        <div className="flex flex-wrap gap-2">
          {variants.map((v) => {
            const out = variantStock(v) <= 0;
            const isActive = v.id === selected.id;
            return (
              <button
                key={v.id}
                type="button"
                disabled={out}
                onClick={() => onSelect(v.id)}
                className={optionClass(isActive, out)}
              >
                <span className="max-w-[180px] truncate">{v.name ?? v.sku}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const current = variantAttrValues(selected);

  function findVariant(target: Record<string, string>) {
    const matches = variants.filter((v) => {
      const a = variantAttrValues(v);
      return Object.entries(target).every(([k, val]) => a[k] === val);
    });
    return matches.find((v) => variantStock(v) > 0) ?? matches[0] ?? null;
  }

  return (
    <div className="mt-6 space-y-5">
      {attributes.map(({ name, values }) => (
        <div key={name}>
          <p className="mb-2 text-sm font-medium text-foreground">
            {name}
            {current[name] && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{current[name]}</span>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {values.map((value) => {
              // Combinação = seleção atual com este atributo trocado.
              const target = { ...current, [name]: value };
              const exact = findVariant(target);
              const looser = exact ?? findVariant({ [name]: value });
              const disabled = !looser || variantStock(looser) <= 0;
              const isActive = current[name] === value;
              const img = (looser?.options as { image_url?: string } | null)?.image_url;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  title={disabled ? "Combinação indisponível" : value}
                  onClick={() => looser && onSelect(looser.id)}
                  className={optionClass(isActive, disabled)}
                >
                  {img && <img src={img} alt="" className="h-8 w-8 rounded-md object-cover" />}
                  <span className="max-w-[160px] truncate">{value}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">SKU: {selected.sku}</p>
    </div>
  );
}

function optionClass(isActive: boolean, disabled: boolean) {
  return [
    "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
    disabled
      ? "cursor-not-allowed border-border/60 text-muted-foreground/60 line-through opacity-60"
      : isActive
        ? "border-primary bg-primary/10 text-primary shadow-[0_0_10px_theme(colors.primary/25%)]"
        : "border-border text-foreground hover:bg-secondary",
  ].join(" ");
}
