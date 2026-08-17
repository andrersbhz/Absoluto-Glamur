from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, got {count}")
    p.write_text(text.replace(old, new, 1))


replace_once(
    "src/routes/index.tsx",
    '''  const hasCategoryGridBlock = blocks.some((block) => block.kind === "category_grid");
  const hasCategoryProductsBlock = blocks.some((block) => block.kind === "category_products");''',
    '''  const hasCategoryGridBlock = blocks.some((block) => block.kind === "category_grid");
  const categoryGridBlockId = blocks.find((block) => block.kind === "category_grid")?.id ?? null;
  const hasCategoryProductsBlock = blocks.some((block) => block.kind === "category_products");''',
)
replace_once(
    "src/routes/index.tsx",
    '''        if (block.kind === "category_grid") {
          return <CategoryGridBlock key={block.id} block={block} categories={categories} />;
        }''',
    '''        if (block.kind === "category_grid") {
          // Several legacy category_grid rows can exist from the old Builder. Render only
          // the first one so the storefront always has one canonical inline category strip.
          if (block.id !== categoryGridBlockId) return null;
          return <CategoryGridBlock key={block.id} block={block} categories={categories} />;
        }''',
)
replace_once(
    "src/routes/_authenticated/admin.home.tsx",
    '''  async function addBlock(kind: AddableBlock) {
    setCreatingBlock(true);''',
    '''  async function addBlock(kind: AddableBlock) {
    if (kind === "category_grid") {
      const existing = blockOrder.find((block) => block.kind === "category_grid");
      if (existing) {
        selectBlock(existing);
        toast.info("O bloco de categorias já existe. Ele foi selecionado para edição.");
        return;
      }
    }
    setCreatingBlock(true);''',
)

print("Single category block consolidation applied.")
