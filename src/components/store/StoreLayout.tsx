import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, Search, ShoppingBag, User } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "@/lib/catalog";
import { useCart } from "@/lib/cart-store";

export function StoreLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const cartCount = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  const [q, setQ] = useState("");
  const [openSearch, setOpenSearch] = useState(false);

  // debounce navigate to /products?q=...
  useEffect(() => {
    if (!openSearch) return;
    const timer = setTimeout(() => {
      if (q.trim().length >= 2) {
        navigate({ to: "/products", search: { q: q.trim() } as never });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, openSearch, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="font-display text-2xl tracking-tight text-primary">
            bloom<span className="text-plum">.</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {categories.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to="/products"
                search={{ category: c.slug } as never}
                className="transition hover:text-foreground"
              >
                {c.name}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Buscar"
              onClick={() => setOpenSearch((v) => !v)}
              className="rounded-full p-2 text-foreground transition hover:bg-secondary"
            >
              <Search className="h-5 w-5" />
            </button>
            <Link
              to={user ? "/favorites" : "/auth"}
              aria-label="Favoritos"
              className="rounded-full p-2 text-foreground transition hover:bg-secondary"
            >
              <Heart className="h-5 w-5" />
            </Link>
            <Link
              to={user ? "/account" : "/auth"}
              aria-label="Minha conta"
              className="rounded-full p-2 text-foreground transition hover:bg-secondary"
            >
              <User className="h-5 w-5" />
            </Link>
            <Link
              to="/cart"
              aria-label="Carrinho"
              className="relative rounded-full p-2 text-foreground transition hover:bg-secondary"
            >
              <ShoppingBag className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
        {openSearch && (
          <div className="border-t border-border/60 bg-background">
            <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar produtos, marcas, categorias..."
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-16 border-t border-border/60 bg-secondary/40">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div>
            <p className="font-display text-2xl text-primary">bloom<span className="text-plum">.</span></p>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Curadoria feminina de skincare, maquiagem e cabelos com envio para todo o Brasil.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Loja</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {categories.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link to="/products" search={{ category: c.slug } as never} className="hover:text-foreground">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Ajuda</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Central de ajuda</li>
              <li>Contato</li>
              <li>Trocas e devoluções</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Institucional</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Políticas</li>
              <li>Termos de uso</li>
              <li>Privacidade</li>
              <li>Cookies</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/60 py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Bloom Cosméticos. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
