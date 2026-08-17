import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Camera,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  autoSyncLiveProductReviews,
  fetchProductReviewsPage,
  fetchProductReviewSummary,
  forceSyncLiveProductReviews,
  REVIEW_PAGE_SIZE,
  type LiveExternalReview,
  type ReviewFilter,
} from "@/lib/product-reviews-live.functions";
import {
  deleteReview,
  listAllReviews,
  upsertReview,
  type ExternalReview,
} from "@/lib/product-reviews.functions";
import { useAuth } from "@/hooks/use-auth";

type Props = { productId: string };

function StarRow({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-3.5 w-3.5";
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`${cls} ${
            i <= Math.round(rating) ? "fill-champagne text-champagne" : "fill-transparent text-muted-foreground/25"
          }`}
        />
      ))}
    </div>
  );
}

function countryFlag(country: string | null): string {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return "";
  return [...country.toUpperCase()].map((char) => String.fromCodePoint(127397 + char.charCodeAt(0))).join("");
}

function ReviewSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse border-b border-border pb-5">
          <div className="h-3 w-28 rounded bg-secondary" />
          <div className="mt-3 h-3 w-44 rounded bg-secondary" />
          <div className="mt-4 h-3 w-full max-w-2xl rounded bg-secondary" />
          <div className="mt-2 h-3 w-2/3 rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}

export function ProductReviews({ productId }: Props) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const adminList = useServerFn(listAllReviews);
  const autoSync = useServerFn(autoSyncLiveProductReviews);
  const forceSync = useServerFn(forceSyncLiveProductReviews);

  const sectionRef = useRef<HTMLElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const autoRanRef = useRef<string | null>(null);
  const [active, setActive] = useState(isAdmin);
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Partial<ExternalReview> | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (active || typeof IntersectionObserver === "undefined") return;
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActive(true);
          observer.disconnect();
        }
      },
      { rootMargin: "700px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active]);

  const summaryQ = useQuery({
    queryKey: ["product-review-summary", productId],
    enabled: active,
    queryFn: () => fetchProductReviewSummary(productId),
    staleTime: 60_000,
  });

  const reviewsQ = useInfiniteQuery({
    queryKey: ["product-external-reviews-live", productId, filter],
    enabled: active && !(isAdmin && showAll),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchProductReviewsPage({ productId, page: pageParam, filter, pageSize: REVIEW_PAGE_SIZE }),
    getNextPageParam: (lastPage, pages) => (lastPage.hasMore ? pages.length : undefined),
    staleTime: 60_000,
  });

  const adminQ = useQuery({
    queryKey: ["admin-external-reviews", productId],
    enabled: isAdmin && showAll,
    queryFn: () => adminList({ data: { product_id: productId } }),
    staleTime: 0,
  });

  const publicReviews = useMemo(
    () => reviewsQ.data?.pages.flatMap((page) => page.rows) ?? [],
    [reviewsQ.data],
  );
  const reviews: Array<LiveExternalReview | ExternalReview> = isAdmin && showAll
    ? adminQ.data ?? []
    : publicReviews;

  async function refetchReviews() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["product-external-reviews-live", productId] }),
      qc.invalidateQueries({ queryKey: ["product-review-summary", productId] }),
      qc.invalidateQueries({ queryKey: ["admin-external-reviews", productId] }),
      qc.invalidateQueries({ queryKey: ["product-external-reviews", productId] }),
      qc.invalidateQueries({ queryKey: ["product"] }),
      qc.invalidateQueries({ queryKey: ["products"] }),
    ]);
  }

  useEffect(() => {
    if (!productId || autoRanRef.current === productId) return;
    autoRanRef.current = productId;
    // Sincroniza em segundo plano assim que a página do produto abre. A renderização
    // do feed continua lazy; o cache por produto impede chamadas repetidas à API.
    autoSync({ data: { product_id: productId } })
      .then(async (result) => {
        if (result?.aggregateUpdated || (result?.upserted ?? 0) > 0 || (result?.translated ?? 0) > 0) await refetchReviews();
      })
      .catch(() => {
        // A sincronização pública é silenciosa; o botão administrativo exibe falhas detalhadas.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    if (!active || !reviewsQ.hasNextPage || reviewsQ.isFetchingNextPage || typeof IntersectionObserver === "undefined") return;
    const node = loadMoreRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void reviewsQ.fetchNextPage();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, reviewsQ.hasNextPage, reviewsQ.isFetchingNextPage, reviewsQ.fetchNextPage]);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await forceSync({ data: { product_id: productId } });
      await refetchReviews();
      const hasRemoteReviews = (result.remoteTotal ?? 0) > 0 || (result.remoteAverage ?? 0) > 0;
      if (result.aggregateUpdated && hasRemoteReviews) {
        const rating = (result.remoteAverage ?? 0) > 0 ? `${result.remoteAverage!.toFixed(1)}/5` : null;
        const total = (result.remoteTotal ?? 0) > 0 ? `${result.remoteTotal} avaliações` : null;
        const details = [rating, total].filter(Boolean).join(" · ");
        toast.success(`Dados oficiais do AliExpress atualizados${details ? `: ${details}` : "."}`);
      } else if ((result.upserted ?? 0) > 0) {
        toast.success(`${result.upserted} avaliações sincronizadas do AliExpress.`);
      } else if (result.error) {
        toast.error(result.error);
      } else if (result.source === "dropshipper_aggregate" && !hasRemoteReviews) {
        toast.info("O AliExpress não retornou avaliações para este produto. Nenhuma nota existente foi alterada.");
      } else {
        toast.info("Os dados de avaliação do AliExpress já estão atualizados.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao sincronizar avaliações.");
    } finally {
      setSyncing(false);
    }
  }

  const summary = summaryQ.data;
  const firstLoading = active && !showAll && reviewsQ.isLoading;

  return (
    <section ref={sectionRef} className="mt-14 border-t border-border pt-9" id="avaliacoes">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-2xl text-foreground sm:text-3xl">Avaliações de clientes</h2>
            {summary && (summary.total > 0 || summary.officialTotal > 0) && (
              <span className="rounded-full bg-[#ff4747]/10 px-2.5 py-1 text-[11px] font-semibold text-[#d93636]">
                AliExpress
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {summary?.officialTotal > 0
              ? "Nota e quantidade sincronizadas do produto original no AliExpress. Comentários disponíveis são exibidos abaixo."
              : "Avaliações disponíveis do produto original e comentários cadastrados na loja."}
          </p>
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar AliExpress"}
            </button>
            <button
              type="button"
              onClick={() => setEditing({ product_id: productId, rating: 5, images: [], is_visible: true })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> Nova avaliação
            </button>
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
            >
              {showAll ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showAll ? "Só públicas" : "Mostrar todas"}
            </button>
          </div>
        )}
      </div>

      {!active ? (
        <div className="min-h-48 rounded-2xl border border-border bg-card/20 p-5">
          <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
          <div className="mt-5 space-y-3">
            <div className="h-3 w-full animate-pulse rounded bg-secondary" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-secondary" />
          </div>
        </div>
      ) : (
        <>
          {!showAll && summary && (summary.total > 0 || summary.officialTotal > 0) && (
            <ReviewOverview summary={summary} filter={filter} onFilter={setFilter} />
          )}

          {!showAll && summary && summary.total > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              <FilterChip selected={filter === "all"} onClick={() => setFilter("all")}>
                Todas ({summary.total})
              </FilterChip>
              <FilterChip selected={filter === "photos"} onClick={() => setFilter("photos")}>
                <Camera className="h-3.5 w-3.5" /> Com fotos ({summary.withPhotos})
              </FilterChip>
              {[5, 4, 3, 2, 1].map((star) => (
                <FilterChip
                  key={star}
                  selected={filter === star}
                  onClick={() => setFilter(star as 1 | 2 | 3 | 4 | 5)}
                >
                  {star} estrelas ({summary.distribution[star as 1 | 2 | 3 | 4 | 5]})
                </FilterChip>
              ))}
            </div>
          )}

          {firstLoading || (showAll && adminQ.isLoading) ? (
            <ReviewSkeleton />
          ) : reviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-5 py-9 text-center">
              <Star className="mx-auto h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium text-foreground">
                {filter === "all"
                  ? summary?.officialTotal > 0
                    ? "A nota geral do produto foi sincronizada com sucesso."
                    : "Ainda não há avaliações disponíveis."
                  : "Nenhuma avaliação neste filtro."}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary?.officialTotal > 0
                  ? "Os comentários individuais deste produto ainda não estão disponíveis para exibição."
                  : "Quando houver comentários disponíveis, eles aparecerão aqui automaticamente."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border border-y border-border">
              {reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  admin={isAdmin}
                  onEdit={() => setEditing(review as ExternalReview)}
                  onChanged={refetchReviews}
                />
              ))}
            </div>
          )}

          {!showAll && reviewsQ.hasNextPage && (
            <div ref={loadMoreRef} className="flex min-h-24 items-center justify-center pt-5">
              <button
                type="button"
                onClick={() => reviewsQ.fetchNextPage()}
                disabled={reviewsQ.isFetchingNextPage}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition hover:border-primary/40 hover:bg-secondary disabled:opacity-60"
              >
                {reviewsQ.isFetchingNextPage && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {reviewsQ.isFetchingNextPage ? "Carregando avaliações..." : "Carregar mais avaliações"}
              </button>
            </div>
          )}

          {!showAll && reviewsQ.isError && (
            <p className="mt-4 text-sm text-destructive">Não foi possível carregar as avaliações agora.</p>
          )}
        </>
      )}

      {editing && (
        <ReviewEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refetchReviews();
          }}
        />
      )}
    </section>
  );
}

function ReviewOverview({
  summary,
  filter,
  onFilter,
}: {
  summary: Awaited<ReturnType<typeof fetchProductReviewSummary>>;
  filter: ReviewFilter;
  onFilter: (filter: ReviewFilter) => void;
}) {
  const hasOfficial = summary.officialTotal > 0;
  const displayAverage = hasOfficial && summary.officialAverage > 0 ? summary.officialAverage : summary.average;
  const displayTotal = hasOfficial ? summary.officialTotal : summary.total;
  return (
    <div className="mb-6 grid gap-6 rounded-2xl bg-secondary/25 p-5 sm:grid-cols-[180px_1fr] sm:p-6">
      <div className="flex flex-col justify-center sm:border-r sm:border-border sm:pr-6">
        <div className="flex items-end gap-1">
          <strong className="font-display text-5xl font-medium leading-none text-foreground">{displayAverage.toFixed(1)}</strong>
          <span className="pb-1 text-sm text-muted-foreground">/ 5</span>
        </div>
        <div className="mt-2"><StarRow rating={displayAverage} size="md" /></div>
        <p className="mt-2 text-xs text-muted-foreground">{hasOfficial ? `${displayTotal} avaliações no produto original` : `${displayTotal} avaliações disponíveis`}</p>
      </div>
      {summary.total > 0 ? (
        <div className="space-y-2">
          {[5, 4, 3, 2, 1].map((star) => {
            const typedStar = star as 1 | 2 | 3 | 4 | 5;
            const count = summary.distribution[typedStar];
            const pct = Math.round((count / summary.total) * 100);
            return (
              <button
                key={star}
                type="button"
                onClick={() => onFilter(filter === typedStar ? "all" : typedStar)}
                className="grid w-full grid-cols-[42px_1fr_58px] items-center gap-3 text-left text-xs text-muted-foreground"
              >
                <span className="flex items-center gap-1">{star}<Star className="h-3 w-3 fill-champagne text-champagne" /></span>
                <span className="h-2 overflow-hidden rounded-full bg-background">
                  <span className="block h-full rounded-full bg-champagne transition-all" style={{ width: `${pct}%` }} />
                </span>
                <span className="text-right">{pct}%</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center rounded-xl border border-border bg-background/60 p-4 text-xs leading-relaxed text-muted-foreground">
          Nota média e quantidade verificadas no produto de origem. Os comentários individuais não são fornecidos pela integração disponível para este item.
        </div>
      )}
    </div>
  );
}

function FilterChip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ReviewCard({
  review,
  admin,
  onEdit,
  onChanged,
}: {
  review: LiveExternalReview | ExternalReview;
  admin: boolean;
  onEdit: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const del = useServerFn(deleteReview);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const translated = "body_translated" in review && review.body_translated === true;
  const isAli = review.source?.startsWith("aliexpress");
  const flag = countryFlag(review.author_country);

  async function handleDelete() {
    if (!confirm("Excluir esta avaliação?")) return;
    try {
      await del({ data: { id: review.id } });
      toast.success("Avaliação excluída");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir avaliação.");
    }
  }

  return (
    <article
      className={`py-6 ${!review.is_visible ? "opacity-60" : ""}`}
      style={{ contentVisibility: "auto", containIntrinsicSize: "1px 260px" }}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StarRow rating={Number(review.rating)} />
            <span className="text-xs font-semibold text-foreground">{Number(review.rating).toFixed(1)}</span>
            {isAli && <span className="rounded bg-[#ff4747]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#d93636]">AliExpress</span>}
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            {review.author_name || (isAli ? "Cliente AliExpress" : "Cliente")}
            {review.author_country && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{flag ? `${flag} ` : ""}{review.author_country}</span>
            )}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {review.reviewed_at && <span>{new Date(review.reviewed_at).toLocaleDateString("pt-BR")}</span>}
            {translated && <span className="inline-flex items-center gap-1"><Check className="h-3 w-3" /> Traduzido para PT-BR</span>}
          </div>
        </div>

        {admin && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-primary" title="Editar avaliação"><Pencil className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={handleDelete} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-destructive" title="Excluir avaliação"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </header>

      {review.title && <p className="mt-3 text-xs font-medium text-muted-foreground">{review.title}</p>}
      {review.body && <p className="mt-2 max-w-4xl whitespace-pre-line text-sm leading-6 text-foreground/85">{review.body}</p>}

      {review.images?.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {review.images.map((url, index) => (
            <button type="button" key={`${url}-${index}`} onClick={() => setLightbox(url)} className="h-20 w-20 overflow-hidden rounded-lg bg-secondary/40 ring-1 ring-border transition hover:ring-primary sm:h-24 sm:w-24">
              <img src={url} alt={`Foto da avaliação ${index + 1}`} className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button type="button" className="absolute right-4 top-4 rounded-full bg-background/90 p-2 text-foreground" onClick={() => setLightbox(null)} aria-label="Fechar imagem"><X className="h-4 w-4" /></button>
          <img src={lightbox} alt="Foto ampliada da avaliação" className="max-h-[90vh] max-w-[95vw] rounded-xl object-contain" />
        </div>
      )}
    </article>
  );
}

function ReviewEditor({ initial, onClose, onSaved }: { initial: Partial<ExternalReview>; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const upsert = useServerFn(upsertReview);
  const [author, setAuthor] = useState(initial.author_name ?? "");
  const [country, setCountry] = useState(initial.author_country ?? "");
  const [rating, setRating] = useState(Number(initial.rating ?? 5));
  const [title, setTitle] = useState(initial.title ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [imagesText, setImagesText] = useState((initial.images ?? []).join("\n"));
  const [visible, setVisible] = useState(initial.is_visible ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const images = imagesText.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
      await upsert({
        data: {
          id: initial.id,
          product_id: initial.product_id!,
          author_name: author || null,
          author_country: country || null,
          rating,
          title: title || null,
          body: body || null,
          images,
          is_visible: visible,
          reviewed_at: initial.reviewed_at ?? null,
        },
      });
      toast.success("Avaliação salva");
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar avaliação.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl">{initial.id ? "Editar avaliação" : "Nova avaliação"}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary" aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Autor"><input value={author} onChange={(e) => setAuthor(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
            <Field label="País"><input value={country} onChange={(e) => setCountry(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
          </div>
          <Field label="Nota (0–5)"><input type="number" step="0.1" min={0} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
          <Field label="Título / variação"><input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
          <Field label="Comentário"><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
          <Field label="Imagens (uma URL por linha)"><textarea value={imagesText} onChange={(e) => setImagesText(e.target.value)} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></Field>
          <label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Visível na loja</label>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">Cancelar</button>
            <button type="button" disabled={saving} onClick={handleSave} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">{saving ? "Salvando..." : "Salvar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="text-xs"><span className="mb-1 block text-muted-foreground">{label}</span>{children}</label>;
}
