import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Heart, Search, ShoppingBag, User, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { categoriesQuery } from "@/lib/catalog";
import { useCart } from "@/lib/cart-store";
import "@/storefront-minimal.css";
import "@/blog.css";

function pageKind(pathname: string): "home" | "cart" | "checkout" | "catalog" | "product" | "store" {
  if (pathname === "/") return "home";
  if (pathname === "/cart") return "cart";
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) return "checkout";
  if (pathname === "/products" || pathname.startsWith("/products/")) return "catalog";
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 2 && !pathname.startsWith("/blog/")) return "product";
  return "store";
}

export function StoreLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: categories = [] } = useQuery(categoriesQuery());
  const cartCount = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  const [q, setQ] = useState("");
  const [openSearch, setOpenSearch] = useState(false);
  const kind = pageKind(location.pathname);

  useEffect(() => {
    // A loja pública usa sempre a identidade visual clara da marca.
    // O modo escuro pertence somente ao painel administrativo e não pode vazar para o storefront.
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    if (!openSearch) return;
    const timer = setTimeout(() => {
      if (q.trim().length >= 2) {
        navigate({ to: "/products", search: { q: q.trim() } as never });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [q, openSearch, navigate]);

  useEffect(() => {
    setOpenSearch(false);
  }, [location.pathname]);

  return (
    <div className="storefront-shell flex min-h-screen flex-col bg-background" data-store-page={kind}>
      <header className="store-header sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="store-logo text-[1.42rem] sm:text-[1.55rem]">
            absoluto glamur<span className="text-plum">.</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            {categories.slice(0, 5).map((c) => (
              <Link
                key={c.id}
                to="/products"
                search={{ category: c.slug } as never}
                className="store-nav-link"
              >
                {c.name}
              </Link>
            ))}
            <Link to="/blog" search={{} as never} className="store-nav-link">
              Blog
            </Link>
          </nav>

          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              aria-label={openSearch ? "Fechar busca" : "Buscar"}
              onClick={() => setOpenSearch((v) => !v)}
              className="store-icon-button rounded-full p-2.5"
            >
              {openSearch ? <X className="h-[18px] w-[18px]" /> : <Search className="h-[18px] w-[18px]" />}
            </button>
            <Link
              to={user ? "/favorites" : "/auth"}
              aria-label="Favoritos"
              className="store-icon-button rounded-full p-2.5"
            >
              <Heart className="h-[18px] w-[18px]" />
            </Link>
            <Link
              to={user ? "/account" : "/auth"}
              aria-label="Minha conta"
              className="store-icon-button rounded-full p-2.5"
            >
              <User className="h-[18px] w-[18px]" />
            </Link>
            <Link
              to="/cart"
              aria-label="Carrinho"
              className="store-icon-button relative rounded-full p-2.5"
            >
              <ShoppingBag className="h-[18px] w-[18px]" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {openSearch && (
          <div className="store-search-panel border-t border-border/70">
            <div className="mx-auto max-w-4xl px-4 py-4 sm:px-6 lg:px-8">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar produtos, marcas e categorias"
                  className="store-search-input w-full border border-border bg-white pl-11 pr-5 text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="store-footer mt-20 border-t">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8 lg:py-16">
          <div>
            <p className="store-logo text-[1.55rem]">absoluto glamur<span className="text-plum">.</span></p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Curadoria feminina de skincare, maquiagem e cabelos com uma experiência de compra simples, segura e elegante.
            </p>
          </div>
          <div>
            <p className="store-footer-title">Loja</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              {categories.slice(0, 4).map((c) => (
                <li key={c.id}>
                  <Link to="/products" search={{ category: c.slug } as never} className="hover:text-foreground">
                    {c.name}
                  </Link>
                </li>
              ))}
              <li><Link to="/blog" search={{} as never} className="hover:text-foreground">Blog de beleza</Link></li>
            </ul>
          </div>
          <div>
            <p className="store-footer-title">Atendimento</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>Central de ajuda</li>
              <li>Contato</li>
              <li>Trocas e devoluções</li>
            </ul>
          </div>
          <div>
            <p className="store-footer-title">Institucional</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li>Políticas</li>
              <li>Termos de uso</li>
              <li>Privacidade</li>
              <li>Cookies</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border/80 py-5 text-center text-[11px] tracking-wide text-muted-foreground">
          © {new Date().getFullYear()} Absoluto Glamur Cosméticos. Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}
