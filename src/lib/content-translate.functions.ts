import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Traduz os textos editáveis da loja (categorias, coleções, blocos e conteúdo
 * da home) para todos os idiomas suportados. O conteúdo original em pt-BR
 * nunca é alterado: o resultado vai para `content_translations`.
 */
const LOCALES = ["en-US", "es", "es-MX", "fr-FR", "it-IT", "de-DE"] as const;

type Item = { scope: string; ref_id: string; fields: Record<string, string> };

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Achata o conteúdo da home nas chaves que realmente aparecem para o cliente. */
function homeItems(home: Record<string, any> | null): Item[] {
  if (!home) return [];
  const fields: Record<string, string> = {};
  const put = (key: string, value: unknown) => {
    const v = text(value);
    if (v) fields[key] = v;
  };
  put("announcement.text", home.announcement?.text);
  put("hero.title_line1", home.hero?.title_line1);
  put("hero.title_highlight", home.hero?.title_highlight);
  put("hero.subtitle", home.hero?.subtitle);
  put("hero.cta_label", home.hero?.cta_label);
  put("manifesto.eyebrow", home.manifesto?.eyebrow);
  put("manifesto.body", home.manifesto?.body);
  put("manifesto.signature", home.manifesto?.signature);
  put("pillars.title", home.pillars?.title);
  (home.pillars?.items ?? []).forEach((item: any, i: number) => {
    put(`pillars.items.${i}.title`, item?.title);
    put(`pillars.items.${i}.body`, item?.body);
  });
  (home.trust_badges ?? []).forEach((badge: any, i: number) => {
    put(`trust_badges.${i}.label`, badge?.label ?? badge?.title);
  });
  (home.hero_slider?.slides ?? []).forEach((slide: any, i: number) => {
    put(`hero_slider.slides.${i}.title`, slide?.title);
    put(`hero_slider.slides.${i}.subtitle`, slide?.subtitle);
    put(`hero_slider.slides.${i}.cta_label`, slide?.cta_label);
  });
  return Object.keys(fields).length > 0 ? [{ scope: "home", ref_id: "home_content", fields }] : [];
}

async function translateBatch(db: any, items: Item[]) {
  const { generateWithOwnKeys } = await import("./ai-translate.server");
  const payload = items.map((i) => ({ id: `${i.scope}:${i.ref_id}`, fields: i.fields }));
  const raw = await generateWithOwnKeys(
    "Você é um tradutor profissional de e-commerce de beleza. Preserve nomes de marca e o tom elegante. Responda somente JSON válido, sem comentários.",
    `Traduza os textos abaixo para ${LOCALES.join(", ")}. Mantenha exatamente as mesmas chaves de campo. Formato de resposta: {"<id>":{"en-US":{"<campo>":"..."},"es":{...},...}, ...}. Textos: ${JSON.stringify(payload)}`,
    db,
  );
  if (!raw) throw new Error("Nenhum provedor de IA configurado conseguiu traduzir os textos.");
  let parsed: Record<string, Record<string, Record<string, string>>>;
  try {
    parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    throw new Error("A IA retornou uma tradução em formato inválido.");
  }

  const rows: any[] = [];
  for (const item of items) {
    const byLocale = parsed[`${item.scope}:${item.ref_id}`];
    if (!byLocale) continue;
    for (const locale of LOCALES) {
      const fields = byLocale[locale];
      if (!fields || typeof fields !== "object") continue;
      const clean: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (typeof value === "string" && value.trim()) clean[key] = value.trim();
      }
      if (Object.keys(clean).length > 0) {
        rows.push({ scope: item.scope, ref_id: item.ref_id, locale, fields: clean });
      }
    }
  }
  if (rows.length === 0) throw new Error("Nenhuma tradução válida foi gerada.");
  const { error } = await db
    .from("content_translations")
    .upsert(rows, { onConflict: "scope,ref_id,locale" });
  if (error) throw new Error(error.message);
  return rows.length;
}

export const translateStoreContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ batch: z.number().int().min(1).max(12).optional() }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const batch = data.batch ?? 8;

    const [cats, cols, blocks, settings, done] = await Promise.all([
      db.from("categories").select("id,name"),
      db.from("collections").select("id,name,description"),
      db.from("homepage_blocks").select("id,title,subtitle"),
      db.from("site_settings").select("value").eq("key", "home_content").maybeSingle(),
      db.from("content_translations").select("scope,ref_id,locale"),
    ]);

    const items: Item[] = [];
    for (const c of cats.data ?? []) {
      const name = text(c.name);
      if (name) items.push({ scope: "category", ref_id: c.id, fields: { name } });
    }
    for (const c of cols.data ?? []) {
      const fields: Record<string, string> = {};
      const name = text(c.name);
      const description = text(c.description);
      if (name) fields.name = name;
      if (description) fields.description = description;
      if (Object.keys(fields).length) items.push({ scope: "collection", ref_id: c.id, fields });
    }
    for (const b of blocks.data ?? []) {
      const fields: Record<string, string> = {};
      const title = text(b.title);
      const subtitle = text(b.subtitle);
      if (title) fields.title = title;
      if (subtitle) fields.subtitle = subtitle;
      if (Object.keys(fields).length) items.push({ scope: "block", ref_id: b.id, fields });
    }
    items.push(...homeItems((settings.data?.value as any) ?? null));

    const counts = new Map<string, number>();
    for (const row of done.data ?? []) {
      const key = `${row.scope}:${row.ref_id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // O conteúdo da home muda com frequência: sempre reprocessamos.
    const pending = items.filter(
      (i) => i.scope === "home" || (counts.get(`${i.scope}:${i.ref_id}`) ?? 0) < LOCALES.length,
    );

    let translated = 0;
    const errors: string[] = [];
    const slice = pending.slice(0, batch);
    if (slice.length > 0) {
      try {
        await translateBatch(db, slice);
        translated = slice.length;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    return {
      total: items.length,
      pending: pending.length,
      translated,
      remaining: Math.max(0, pending.length - translated - (errors.length ? slice.length : 0)),
      errors,
    };
  });
