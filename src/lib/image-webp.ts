/**
 * Converte um File de imagem (JPEG/PNG/GIF/AVIF/etc.) em WebP via canvas.
 * Retorna um data URI pronto pra salvar em campos JSON ou <img src>.
 *
 * Para banners na homepage — a imagem raramente passa dos 200-400 KB em WebP
 * a 82% de qualidade e 1600px de largura máxima, o que cabe tranquilo no
 * JSON do bloco (`homepage_blocks.data.image_url`) sem precisar de bucket.
 */
export async function imageFileToWebpDataUri(
  file: File,
  opts?: { maxWidth?: number; quality?: number },
): Promise<{ dataUri: string; width: number; height: number; sizeKb: number }> {
  const maxWidth = opts?.maxWidth ?? 1600;
  const quality = opts?.quality ?? 0.82;

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Não foi possível ler a imagem"));
      el.src = url;
    });

    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas não suportado no navegador");
    ctx.drawImage(img, 0, 0, w, h);

    const dataUri = canvas.toDataURL("image/webp", quality);
    if (!dataUri.startsWith("data:image/webp")) {
      throw new Error("Este navegador não suporta WebP. Atualize o navegador.");
    }
    // dataUri tamanho aproximado
    const base64 = dataUri.split(",")[1] ?? "";
    const sizeKb = Math.round((base64.length * 3) / 4 / 1024);
    return { dataUri, width: w, height: h, sizeKb };
  } finally {
    URL.revokeObjectURL(url);
  }
}
