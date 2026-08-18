import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createAliExpressBrowserReviewCodeForProduct } from "@/lib/aliexpress-browser-review-import.functions";
import { forceSyncLiveProductReviews } from "@/lib/product-reviews-live.functions";

type ExtensionMessage = {
  source?: string;
  type?: string;
  requestId?: string;
  version?: string;
  ok?: boolean;
  imported?: number;
  withPhotos?: number;
  remoteTotal?: number;
  average?: number;
  error?: string;
};

function requestId(prefix: string) {
  const random = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
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
      resolve(data.version || "1.1.0");
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("A extensão Absoluto Glamur 1.1.0 não respondeu. Atualize/recarregue a extensão em chrome://extensions e recarregue esta página."));
    }, 2200);

    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "absoluto-glamur-store", type: "AG_EXTENSION_PING", requestId: id },
      window.location.origin,
    );
  });
}

function importWithExtension(input: {
  bridgeCode: string;
  productId: string;
  sourceUrl: string;
}): Promise<ExtensionMessage> {
  return new Promise((resolve, reject) => {
    const id = requestId("ag-sync");
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
    };
    const onMessage = (event: MessageEvent<ExtensionMessage>) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.source !== "absoluto-glamur-extension" || data.type !== "AG_REVIEW_SYNC_RESULT" || data.requestId !== id) return;
      cleanup();
      if (data.ok) resolve(data);
      else reject(new Error(data.error || "A extensão não conseguiu importar as avaliações."));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("A importação pelo Chrome excedeu o tempo esperado. Verifique a aba do AliExpress e tente novamente."));
    }, 120_000);

    window.addEventListener("message", onMessage);
    window.postMessage(
      {
        source: "absoluto-glamur-store",
        type: "AG_REVIEW_SYNC_REQUEST",
        requestId: id,
        bridgeCode: input.bridgeCode,
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
  const createBrowserCode = useServerFn(createAliExpressBrowserReviewCodeForProduct);

  useEffect(() => {
    const onClick = async (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      if (!(target instanceof HTMLButtonElement)) return;
      const label = (target.textContent || "").replace(/\s+/g, " ").trim();
      if (label !== "Sincronizar AliExpress") return;

      // O botão já existe no componente de avaliações. Interceptamos somente esta
      // ação administrativa para acrescentar o fallback da extensão sem alterar UI.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (target.disabled) return;
      const originalHtml = target.innerHTML;
      target.disabled = true;
      target.setAttribute("aria-busy", "true");
      target.textContent = "Sincronizando...";

      let productId: string | null = null;
      let aggregateUpdated = false;
      try {
        productId = await resolveCurrentProductId();

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

        await waitForExtension();

        const bridge = await createBrowserCode({
          data: {
            product_id: productId,
            origin: window.location.origin,
          },
        });

        toast.info("Abrindo o AliExpress no Chrome para buscar os comentários...");
        const imported = await importWithExtension({
          bridgeCode: bridge.code,
          productId: bridge.sourceProductId,
          sourceUrl: bridge.sourceUrl,
        });

        await Promise.all([
          qc.invalidateQueries({ queryKey: ["product-external-reviews-live", productId] }),
          qc.invalidateQueries({ queryKey: ["product-review-summary", productId] }),
          qc.invalidateQueries({ queryKey: ["admin-external-reviews", productId] }),
          qc.invalidateQueries({ queryKey: ["product-external-reviews", productId] }),
          qc.invalidateQueries({ queryKey: ["product"] }),
          qc.invalidateQueries({ queryKey: ["products"] }),
        ]);

        const count = Number(imported.imported ?? 0);
        const photos = Number(imported.withPhotos ?? 0);
        const remote = Number(imported.remoteTotal ?? count);
        toast.success(`${count} avaliações importadas pelo Chrome${photos > 0 ? ` · ${photos} com fotos` : ""}${remote > count ? ` · ${remote} detectadas` : ""}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao sincronizar avaliações.";
        if (aggregateUpdated) {
          toast.error(`Nota/quantidade foram atualizadas, mas os comentários não foram importados. ${message}`);
        } else {
          toast.error(message);
        }
      } finally {
        target.disabled = false;
        target.removeAttribute("aria-busy");
        target.innerHTML = originalHtml;
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [createBrowserCode, forceSync, qc]);

  return null;
}
