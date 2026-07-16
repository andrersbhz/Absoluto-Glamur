import { Link } from "@tanstack/react-router";
import { Heart, Search, ShoppingBag, User } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

export function StoreLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="font-display text-2xl tracking-tight text-primary">
            bloom<span className="text-plum">.</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <span className="cursor-not-allowed opacity-60" title="Fase 2">Skincare</span>
            <span className="cursor-not-allowed opacity-60" title="Fase 2">Maquiagem</span>
            <span className="cursor-not-allowed opacity-60" title="Fase 2">Cabelos</span>
            <span className="cursor-not-allowed opacity-60" title="Fase 2">Kits</span>
            <span className="cursor-not-allowed opacity-60" title="Fase 2">Ofertas</span>
          </nav>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Buscar"
              className="rounded-full p-2 text-muted-foreground opacity-60 transition hover:bg-secondary"
              disabled
              title="Disponível na Fase 2"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Favoritos"
              className="rounded-full p-2 text-muted-foreground opacity-60 transition hover:bg-secondary"
              disabled
              title="Disponível na Fase 2"
            >
              <Heart className="h-5 w-5" />
            </button>
            <Link
              to={user ? "/account" : "/auth"}
              aria-label="Minha conta"
              className="rounded-full p-2 text-foreground transition hover:bg-secondary"
            >
              <User className="h-5 w-5" />
            </Link>
            <button
              type="button"
              aria-label="Carrinho"
              className="rounded-full p-2 text-muted-foreground opacity-60 transition hover:bg-secondary"
              disabled
              title="Disponível na Fase 3"
            >
              <ShoppingBag className="h-5 w-5" />
            </button>
          </div>
        </div>
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
              <li>Skincare</li>
              <li>Maquiagem</li>
              <li>Cabelos</li>
              <li>Kits</li>
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
