from pathlib import Path

path = Path('src/components/store/ProductReviews.tsx')
text = path.read_text()
old = '''  useEffect(() => {
    if (!active || !productId || autoRanRef.current === productId) return;
    autoRanRef.current = productId;
    autoSync({ data: { product_id: productId } })
      .then(async (result) => {
        if ((result?.upserted ?? 0) > 0 || (result?.translated ?? 0) > 0) await refetchReviews();
      })
      .catch(() => {
        // A sincronização pública é silenciosa; o botão administrativo exibe falhas detalhadas.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, productId]);
'''
new = '''  useEffect(() => {
    if (!productId || autoRanRef.current === productId) return;
    autoRanRef.current = productId;
    // Sincroniza em segundo plano assim que a página do produto abre. A renderização
    // do feed continua lazy; o cache por produto impede chamadas repetidas à API.
    autoSync({ data: { product_id: productId } })
      .then(async (result) => {
        if ((result?.upserted ?? 0) > 0 || (result?.translated ?? 0) > 0) await refetchReviews();
      })
      .catch(() => {
        // A sincronização pública é silenciosa; o botão administrativo exibe falhas detalhadas.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
'''
if text.count(old) != 1:
    raise SystemExit('target review auto-sync effect not found exactly once')
path.write_text(text.replace(old, new, 1))
