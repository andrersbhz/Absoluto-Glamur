import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { imageFileToWebpDataUri } from "@/lib/image-webp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  label?: string;
  value?: string | null;
  onChange: (url: string) => void;
  recommended?: string;
  maxWidth?: number;
  compact?: boolean;
};

export function HomeImageUpload({
  label = "Imagem",
  value,
  onChange,
  recommended,
  maxWidth = 1920,
  compact = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ width: number; height: number; sizeKb: number } | null>(null);

  async function handleFile(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem JPEG, PNG, WebP, AVIF ou GIF.");
      return;
    }
    setBusy(true);
    try {
      const result = await imageFileToWebpDataUri(file, { maxWidth, quality: 0.84 });
      setMeta({ width: result.width, height: result.height, sizeKb: result.sizeKb });
      onChange(result.dataUri);
      if (result.sizeKb > 950) {
        toast.warning(`Imagem com ${result.sizeKb} KB. Considere uma imagem mais leve para melhorar o carregamento.`);
      } else {
        toast.success(`Imagem pronta · ${result.width}×${result.height} · ${result.sizeKb} KB`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível processar a imagem.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={`rounded-xl border border-border bg-secondary/20 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {recommended && <p className="mt-0.5 text-[11px] text-muted-foreground">Recomendado: {recommended}</p>}
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
          />
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            Upload
          </Button>
          {!!value && (
            <Button type="button" size="icon" variant="ghost" onClick={() => { setMeta(null); onChange(""); }} title="Remover imagem">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      <div className={`mt-3 grid gap-3 ${value && !compact ? "sm:grid-cols-[150px_1fr]" : ""}`}>
        {!!value && !compact && (
          <div className="aspect-[16/9] overflow-hidden rounded-lg border border-border bg-background">
            <img src={value} alt="Preview do upload" className="h-full w-full object-cover" />
          </div>
        )}
        <div>
          <label className="text-[11px] font-medium text-muted-foreground">Ou cole a URL da imagem</label>
          <div className="relative mt-1">
            <ImagePlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value?.startsWith("data:") ? "" : value ?? ""}
              onChange={(event) => { setMeta(null); onChange(event.target.value); }}
              placeholder={value?.startsWith("data:") ? "Imagem enviada por upload" : "https://..."}
              className="pl-9"
            />
          </div>
          {meta && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              WebP · {meta.width}×{meta.height}px · {meta.sizeKb} KB
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
