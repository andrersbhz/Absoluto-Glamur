import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getAliExpressBrowserReviewTargetForProduct,
  importAliExpressBrowserReviewsAuthenticated,
} from "@/lib/aliexpress-browser-review-auth.functions";
import { forceSyncLiveProductReviews } from "@/lib/product-reviews-live.functions";

type BrowserReview = {
  id?: string | null;
  author?: string | null;
  country?: string | null;
  rating: number;
  title?: string | null;
  body: string;
  images?: string[];
  reviewed_at?: string | null;
};

type ExtensionMessage = {
  source?: string;
  type?: string;
  requestId?: string;
  version?: string;
  enabled?: boolean;
  ok?: boolean;
  imported?: number;
  withPhotos?: number;
  remoteTotal?: number;
  average?: number;
  reviews?: BrowserReview[];
  error?: string;
  stage?: string;
};

function requestId(prefix: string) {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

function versionAtLeast(version: string, minimum: string) {
  const parse = (value: string) => value.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const current = parse(version);
  const required = parse(minimum);
  for (let i = 0; i < Math.max(current.length, required.length); i += 1) {
    if ((current[i] ?? 0) > (required[i] ?? 0)) return true;
    if ((current[i] ?? 0) < (required[i] ?? 0)) return false;
  }
  return true;
}

function waitForExtension(): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = requestId("ag-ping");
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
    const onMessage = (event: MessageEvent<ExtensionMessage>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "absoluto-glamur-extension" || data.type !== "AG_EXTENSION_READY" || data.requestId !== id) return;
      cleanup();
      const version = data.version || "0.0.0";
      if (data.enabled === false) {
        reject(new Error("A extensão Absoluto Glamur está DESLIGADA. Clique no ícone da extensão e pressione Ligar."));
        return;
      }
      if (!versionAtLeast(version, "1.7.2")) {
        reject(new Error(`A extensão Absoluto Glamur ${version} está desatualizada. Instale a versão 1.7.2 ou superior e recarregue esta página.`));
        return;
      }
      resolve(version);
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("A extensão Absoluto Glamur não respondeu. Recarregue a extensão em chrome://extensions e depois recarregue esta página."));
    }, 3000);

    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "absoluto-glamur-store", type: "AG_EXTENSION_PING", requestId: id },
      window.location.origin,
    );
  });
}

function collectWithExtension(input: {
  productId: string;
  sourceUrl: string;
  extensionVersion: string;
}): Promise<ExtensionMessage> {
  return new Promise((resolve, reject) => {
    const id = requestId("ag-sync");
    const progressToastId = `ag-review-${id}`;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      toast.dismiss(progressToastId);
    };
    const onMessage = (event: MessageEvent<ExtensionMessage>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "absoluto-glamur-extension" || data.requestId !== id) return;

      if (data.type === "AG_REVIEW_SYNC_PROGRESS") {
        toast.loading(data.stage || "Coletando avaliações no AliExpress...", { id: progressToastId });
        return;
      }
      if (data.type !== "AG_REVIEW_SYNC_RESULT") return;

      cleanup();
      if (data.ok) resolve(data);
      else reject(new Error(data.error || "A extensão não conseguiu coletar as avaliações."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`A extensão ${input.extensionVersion} abriu o fluxo do AliExpress, mas não concluiu a coleta dentro do limite. Verifique a aba do produto e tente novamente.`));
    }, 150_000);

    window.addEventListener("message", onMessage);
    toast.loading("Preparando a coleta no Chrome...", { id: progressToastId });
    window.postMessage(
      {
        source: "absoluto-glamur-store",
        type: "AG_REVIEW_SYNC_REQUEST",
        requestId: id,
        productId: input.productId,
        sourceUrl: input.sourceUrl,
      },
      window.location.origin,
    );
  });
}

async function resolveCurrentProductId(): Promise<string> {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const slug = decodeURIComponent(parts.at(-1) || "").trim();
  if (!slug) throw new Error("Não foi possível identificar o produto desta página.");

  const { data, error } = await supabase
    .from("products")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.id) throw new Error("Produto atual não encontrado no catálogo.");
  return data.id;
}

export function AliExpressReviewSyncBridge() {
  const qc = useQueryClient();
  const forceSync = useServerFn(forceSyncLiveProductReviews);
  const getBrowserTarget = useServerFn(getAliExpressBrowserReviewTargetForProduct);
  const saveBrowserReviews = useServerFn(importAliExpressBrowserReviewsAuthenticated);

  useEffect(() => {
    let activeSync = false;

    const onClick = async (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const label = (target.textContent || "").replace(/\s+/g, " ").trim();
      if (label !== "Sincronizar AliExpress") return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (target.disabled || activeSync) {
        toast.info("Já existe uma sincronização do AliExpress em andamento.");
        return;
      }
      activeSync = true;
      const originalHtml = target.innerHTML;
      target.disabled = true;
      target.setAttribute("aria-busy", "true");
      target.textContent = "Sincronizando...";

      let productId: string | null = null;
      let aggregateUpdated = false;
      let directSyncError: string | null = null;
      try {
        productId = await resolveCurrentProductId();

        try {
          const serverResult = await forceSync({ data: { product_id: productId } });
          aggregateUpdated = Boolean(serverResult.aggregateUpdated);

          if ((serverResult.upserted ?? 0) > 0) {
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["product-external-reviews-live", productId] }),
              qc.invalidateQueries({ queryKey: ["product-review-summary", productId] }),
              qc.invalidateQueries({ queryKey: ["admin-external-reviews", productId] }),
              qc.invalidateQueries({ queryKey: ["product"] }),
              qc.invalidateQueries({ queryKey: ["products"] }),
            ]);
            toast.success(`${serverResult.upserted} avaliações sincronizadas do AliExpress.`);
            return;
          }

          if (serverResult.error) directSyncError = String(serverResult.error);
        } catch (error) {
          directSyncError = error instanceof Error ? error.message : String(error);
        }

        const extensionVersion = await waitForExtension();
        const browserTarget = await getBrowserTarget({ data: { product_id: productId } });

        toast.info(
          directSyncError
            ? `A coleta direta não trouxe os comentários. A extensão ${extensionVersion} vai abrir o produto no AliExpress e usar sua sessão do Chrome...`
            : `Abrindo o AliExpress com a extensão ${extensionVersion} para buscar os comentários...`,
        );

        const collected = await collectWithExtension({
          productId: browserTarget.sourceProductId,
          sourceUrl: browserTarget.sourceUrl,
          extensionVersion,
        });
        const reviews = collected.reviews ?? [];
        if (!reviews.length) throw new Error("A extensão terminou a coleta, mas não retornou avaliações válidas.");

        const saved = await saveBrowserReviews({
          data: {
            product_id: productId,
            source_product_id: browserTarget.sourceProductId,
            remote_total: Number(collected.remoteTotal ?? reviews.length),
            reviews: reviews.map((review) => ({ ...review, images: review.images ?? [] })),
          },
        });

        await Promise.all([
          qc.invalidateQueries({ queryKey: ["product-external-reviews-live", productId] }),
          qc.invalidateQueries({ queryKey: ["product-review-summary", productId] }),
          qc.invalidateQueries({ queryKey: ["admin-external-reviews", productId] }),
          qc.invalidateQueries({ queryKey: ["product-external-reviews", productId] }),
          qc.invalidateQueries({ queryKey: ["product"] }),
          qc.invalidateQueries({ queryKey: ["products"] }),
        ]);

        toast.success(`${saved.imported} avaliações importadas pelo Chrome${saved.withPhotos > 0 ? ` · ${saved.withPhotos} com fotos` : ""}${saved.remoteTotal > saved.imported ? ` · ${saved.remoteTotal} detectadas` : ""}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao sincronizar avaliações.";
        const suffix = directSyncError && message !== directSyncError
          ? " A coleta direta também não retornou comentários."
          : "";
        if (aggregateUpdated) {
          toast.error(`Nota/quantidade foram atualizadas, mas os comentários não foram importados. ${message}${suffix}`);
        } else {
          toast.error(`${message}${suffix}`);
        }
      } finally {
        activeSync = false;
        target.disabled = false;
        target.removeAttribute("aria-busy");
        target.innerHTML = originalHtml;
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [forceSync, getBrowserTarget, qc, saveBrowserReviews]);

  return null;
}
