import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";

// Carregamento dinâmico para evitar overhead no bundle principal
const MapView = lazy(() => import("@/components/admin/analytics/LiveMapView"));

export const Route = createFileRoute("/_authenticated/admin/map")({
  component: AdminMapPage,
});

function AdminMapPage() {
  return (
    <AdminLayout>
      <div className="flex h-[calc(100vh-64px)] flex-col space-y-4 p-6 overflow-hidden">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mapa ao Vivo</h1>
          <p className="text-muted-foreground">Monitoramento de visitantes e atividade em tempo real.</p>
        </div>

        <div className="flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-plum/10">
          <Suspense fallback={<MapSkeleton />}>
            <MapView />
          </Suspense>
        </div>
      </div>
    </AdminLayout>
  );
}

function MapSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-card/50">
      <div className="text-center">
        <Skeleton className="mx-auto h-32 w-32 rounded-full" />
        <p className="mt-4 animate-pulse text-sm text-muted-foreground">Inicializando radar de visitantes...</p>
      </div>
    </div>
  );
}
