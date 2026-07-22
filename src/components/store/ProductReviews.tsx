import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Star, Pencil, RefreshCcw, Trash2, Plus, X, Eye, EyeOff } from "lucide-react";
import {
  productReviewsQuery,
  syncAliexpressReviews,
  upsertReview,
  deleteReview,
  listAllReviews,
  type ExternalReview,
} from "@/lib/product-reviews.functions";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  productId: string;
};

function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i <= Math.round(rating)
              ? "fill-champagne text-champagne"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export function ProductReviews({ productId }: Props) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const publicQ = useQuery(productReviewsQuery(productId));
  const adminList = useServerFn(listAllReviews);
  const sync = useServerFn(syncAliexpressReviews);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState<Partial<ExternalReview> | null>(null);
  const [syncing, setSyncing] = useState(false);

  const adminQ = useQuery({
    queryKey: ["admin-external-reviews", productId],
    enabled: isAdmin && showAll,
    queryFn: () => adminList({ data: { product_id: productId } }),
  });

  const reviews = (isAdmin && showAll ? adminQ.data : publicQ.data) ?? [];

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["product-external-reviews", productId] });
    qc.invalidateQueries({ queryKey: ["admin-external-reviews", productId] });
  };

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await sync({ data: { product_id: productId, min_rating: 4.5 } });
      if ((r as { upserted?: number }).upserted && (r as { upserted?: number }).upserted! > 0) {
        toast.success(`${(r as { upserted: number }).upserted} avaliações importadas.`);
      } else {
        toast.info((r as { message?: string }).message ?? "Nenhuma avaliação nova.");
      }
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  if (!isAdmin && reviews.length === 0) return null;

  return (
    <section className="mt-12 border-t border-border pt-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Avaliações de clientes</h2>
          <p className="text-xs text-muted-foreground">
            Apenas comentários com nota 4.5 ou superior · {reviews.length}{" "}
            {reviews.length === 1 ? "avaliação" : "avaliações"}
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
              Sincronizar do AliExpress
            </button>
            <button
              type="button"
              onClick={() =>
                setEditing({
                  product_id: productId,
                  rating: 5,
                  images: [],
                  is_visible: true,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
            >
              <Plus className="h-3.5 w-3.5" /> Nova avaliação
            </button>
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary"
            >
              {showAll ? (
                <>
                  <Eye className="h-3.5 w-3.5" /> Só visíveis
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5" /> Mostrar todas
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhuma avaliação ainda. Sincronize do AliExpress ou adicione manualmente.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {reviews.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              admin={isAdmin}
              onEdit={() => setEditing(r)}
              onChanged={refetch}
            />
          ))}
        </div>
      )}

      {editing && (
        <ReviewEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </section>
  );
}

function ReviewCard({
  review,
  admin,
  onEdit,
  onChanged,
}: {
  review: ExternalReview;
  admin: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const del = useServerFn(deleteReview);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function handleDelete() {
    if (!confirm("Excluir esta avaliação?")) return;
    try {
      await del({ data: { id: review.id } });
      toast.success("Avaliação excluída");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  }

  return (
    <article
      className={`rounded-2xl border border-border bg-card/40 p-4 ${
        !review.is_visible ? "opacity-60" : ""
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <StarRow rating={review.rating} />
            <span className="text-xs font-medium text-foreground">
              {Number(review.rating).toFixed(1)}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground">
            {review.author_name ?? "Cliente AliExpress"}
            {review.author_country && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                · {review.author_country}
              </span>
            )}
          </p>
          {review.reviewed_at && (
            <p className="text-[11px] text-muted-foreground">
              {new Date(review.reviewed_at).toLocaleDateString("pt-BR")}
            </p>
          )}
        </div>
        {admin && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-primary"
              title="Editar"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-destructive"
              title="Excluir"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>
      {review.title && (
        <h3 className="mt-3 text-sm font-semibold text-foreground">{review.title}</h3>
      )}
      {review.body && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {review.body}
        </p>
      )}
      {review.images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.images.map((url, i) => (
            <button
              type="button"
              key={i}
              onClick={() => setLightbox(url)}
              className="h-20 w-20 overflow-hidden rounded-lg bg-secondary/40 ring-1 ring-border transition hover:ring-primary"
            >
              <img src={url} alt={`Foto enviada por ${review.author_name ?? "cliente"}${review.title ? ` — ${review.title}` : ""}`} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-background/90 p-2 text-foreground"
            onClick={() => setLightbox(null)}
          >
            <X className="h-4 w-4" />
          </button>
          <img src={lightbox} alt={`Foto ampliada da avaliação de ${initialAuthorLabel(review)}`} className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </article>
  );
}

function ReviewEditor({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<ExternalReview>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertReview);
  const [author, setAuthor] = useState(initial.author_name ?? "");
  const [country, setCountry] = useState(initial.author_country ?? "");
  const [rating, setRating] = useState<number>(Number(initial.rating ?? 5));
  const [title, setTitle] = useState(initial.title ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [imagesText, setImagesText] = useState((initial.images ?? []).join("\n"));
  const [visible, setVisible] = useState(initial.is_visible ?? true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const images = imagesText
        .split(/\s+/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//.test(s));
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
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl">
            {initial.id ? "Editar avaliação" : "Nova avaliação"}
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">Autor</span>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-muted-foreground">País</span>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Nota (0–5)</span>
            <input
              type="number"
              step="0.1"
              min={0}
              max={5}
              value={rating}
              onChange={(e) => setRating(parseFloat(e.target.value))}
              className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Título</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">Comentário</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted-foreground">
              Imagens (uma URL por linha)
            </span>
            <textarea
              value={imagesText}
              onChange={(e) => setImagesText(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono"
              placeholder="https://..."
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={visible}
              onChange={(e) => setVisible(e.target.checked)}
            />
            <span>Visível na loja</span>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
