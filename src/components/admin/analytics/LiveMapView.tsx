import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Download,
  Eye,
  Filter,
  Globe,
  History,
  LayoutGrid,
  MapPin,
  Monitor,
  MousePointer2,
  PackageSearch,
  Radio,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  exportAnalyticsCsv,
  getAnalyticsActivity,
  getAnalyticsStats,
  getOperatorNotifications,
  markNotificationRead,
} from "@/lib/analytics.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";

const geoUrl = "/data/brazil-states.topo.json";
const LIVE_WINDOW_MS = 90_000;

type FunnelStage = "browsing" | "product_view" | "cart" | "checkout" | "purchased";
type Period = "today" | "24h" | "7d" | "30d";

interface VisitorSession {
  id: string;
  visitor_id?: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  current_page: string | null;
  funnel_stage: FunnelStage;
  is_online: boolean;
  device_type: string | null;
  last_seen_at: string;
  latitude_approx: number | null;
  longitude_approx: number | null;
  items_count?: number | null;
  cart_value_cents?: number | null;
}

type ActivitySession = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  is_online?: boolean | null;
  last_seen_at?: string | null;
  funnel_stage?: FunnelStage | null;
  current_page?: string | null;
  device_type?: string | null;
};

interface AnalyticsActivity {
  id: string;
  session_id: string | null;
  visitor_id: string | null;
  event_name: string;
  page_path: string | null;
  product_name: string | null;
  value_cents: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  session?: ActivitySession | ActivitySession[] | null;
}

const STAGE_RANK: Record<FunnelStage, number> = {
  browsing: 0,
  product_view: 1,
  cart: 2,
  checkout: 3,
  purchased: 4,
};

const STAGE_STYLE: Record<FunnelStage, { label: string; fill: string; halo: string; text: string }> = {
  browsing: {
    label: "Navegando",
    fill: "#A890AE",
    halo: "rgba(168, 144, 174, 0.20)",
    text: "text-lavender",
  },
  product_view: {
    label: "Vendo produto",
    fill: "#C64B76",
    halo: "rgba(198, 75, 118, 0.22)",
    text: "text-primary",
  },
  cart: {
    label: "Carrinho",
    fill: "#D3943A",
    halo: "rgba(211, 148, 58, 0.22)",
    text: "text-warning",
  },
  checkout: {
    label: "Checkout",
    fill: "#B57D9F",
    halo: "rgba(181, 125, 159, 0.24)",
    text: "text-plum",
  },
  purchased: {
    label: "Comprou",
    fill: "#2F8B6D",
    halo: "rgba(47, 139, 109, 0.22)",
    text: "text-success",
  },
};

function getActivitySession(activity: AnalyticsActivity): ActivitySession | null {
  if (!activity.session) return null;
  return Array.isArray(activity.session) ? (activity.session[0] ?? null) : activity.session;
}

function isFresh(visitor: VisitorSession) {
  return visitor.is_online && Date.now() - new Date(visitor.last_seen_at).getTime() <= LIVE_WINDOW_MS;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatLocation(city?: string | null, state?: string | null, country?: string | null) {
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  if (country) return country === "BR" ? "Brasil · localização aproximada indisponível" : country;
  return "Localização aproximada indisponível";
}

function eventLabel(eventName: string) {
  switch (eventName) {
    case "page_view": return "Visitou página";
    case "view_item": return "Viu produto";
    case "add_to_cart": return "Adicionou ao carrinho";
    case "remove_from_cart": return "Removeu do carrinho";
    case "cart_change": return "Alterou o carrinho";
    case "begin_checkout": return "Iniciou checkout";
    case "purchase": return "Compra confirmada";
    case "checkout_abandoned": return "Saiu do checkout";
    default: return eventName.replaceAll("_", " ");
  }
}

function EventIcon({ eventName, className = "h-3.5 w-3.5" }: { eventName: string; className?: string }) {
  if (eventName === "view_item") return <PackageSearch className={className} />;
  if (eventName === "add_to_cart" || eventName === "cart_change") return <ShoppingCart className={className} />;
  if (eventName === "remove_from_cart") return <ShoppingBag className={className} />;
  if (eventName === "begin_checkout" || eventName === "checkout_abandoned") return <CreditCard className={className} />;
  if (eventName === "purchase") return <CheckCircle2 className={className} />;
  return <MousePointer2 className={className} />;
}

export default function LiveMapView() {
  const [visitors, setVisitors] = useState<VisitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("today");
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [streamMode, setStreamMode] = useState<"live" | "history">("live");
  const queryClient = useQueryClient();
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const statsFn = useServerFn(getAnalyticsStats);
  const activityFn = useServerFn(getAnalyticsActivity);
  const notificationsFn = useServerFn(getOperatorNotifications);
  const markReadFn = useServerFn(markNotificationRead);
  const exportFn = useServerFn(exportAnalyticsCsv);

  const { data: stats } = useQuery({
    queryKey: ["analytics-stats", period],
    queryFn: () => statsFn({ data: { period } }),
    enabled: hasSession,
    retry: false,
    refetchInterval: 10_000,
  });

  const { data: activityData } = useQuery({
    queryKey: ["analytics-activity", period],
    queryFn: () => activityFn({ data: { period } }),
    enabled: hasSession,
    retry: false,
    refetchInterval: 8_000,
  });
  const activity = (activityData ?? []) as unknown as AnalyticsActivity[];

  const { data: notifications } = useQuery({
    queryKey: ["operator-notifications"],
    queryFn: () => notificationsFn(),
    enabled: hasSession,
    retry: false,
    refetchInterval: 5_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markReadFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["operator-notifications"] }),
  });

  useEffect(() => {
    const fetchInitial = async () => {
      const cutoff = new Date(Date.now() - LIVE_WINDOW_MS).toISOString();
      const { data, error } = await supabase
        .from("visitor_sessions")
        .select("*")
        .eq("is_online", true)
        .gte("last_seen_at", cutoff)
        .order("last_seen_at", { ascending: false });

      if (!error && data) setVisitors((data as VisitorSession[]).filter(isFresh));
      setLoading(false);
    };

    void fetchInitial();

    const channel = supabase
      .channel("live_visitors_map_v3")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const next = payload.new as VisitorSession;
            if (isFresh(next)) {
              setVisitors((prev) => prev.some((visitor) => visitor.id === next.id) ? prev : [next, ...prev]);
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as VisitorSession;
            if (!isFresh(updated)) {
              setVisitors((prev) => prev.filter((visitor) => visitor.id !== updated.id));
            } else {
              setVisitors((prev) => {
                const exists = prev.some((visitor) => visitor.id === updated.id);
                return exists
                  ? prev.map((visitor) => visitor.id === updated.id ? { ...visitor, ...updated } : visitor)
                  : [updated, ...prev];
              });
            }
          } else if (payload.eventType === "DELETE") {
            setVisitors((prev) => prev.filter((visitor) => visitor.id !== payload.old.id));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "operator_notifications" },
        (payload) => {
          const audio = document.getElementById("whatsapp-alert") as HTMLAudioElement | null;
          if (audio) audio.play().catch(() => undefined);
          toast.info(payload.new.title, {
            description: payload.new.content,
            action: {
              label: "Ver jornada",
              onClick: () => setSelectedVisitorId(payload.new.session_id),
            },
          });
          queryClient.invalidateQueries({ queryKey: ["operator-notifications"] });
        },
      )
      .subscribe();

    // Segurança visual: mesmo se Realtime falhar, nenhum ponto fica preso no mapa.
    const sweep = window.setInterval(() => {
      setVisitors((prev) => prev.filter(isFresh));
    }, 15_000);

    return () => {
      window.clearInterval(sweep);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleExport = async () => {
    try {
      const { csv, filename } = await exportFn({ data: { period } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída");
    } catch {
      toast.error("Erro ao exportar dados");
    }
  };

  const clusters = useMemo(() => {
    const map = new Map<string, { lat: number; lon: number; count: number; stage: FunnelStage; ids: string[] }>();
    visitors.forEach((visitor) => {
      if (visitor.latitude_approx == null || visitor.longitude_approx == null) return;
      const lat = Math.round(Number(visitor.latitude_approx) * 10) / 10;
      const lon = Math.round(Number(visitor.longitude_approx) * 10) / 10;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const key = `${lat}-${lon}`;
      const current = map.get(key) ?? { lat, lon, count: 0, stage: visitor.funnel_stage, ids: [] };
      current.count += 1;
      current.ids.push(visitor.id);
      if (STAGE_RANK[visitor.funnel_stage] > STAGE_RANK[current.stage]) current.stage = visitor.funnel_stage;
      map.set(key, current);
    });
    return Array.from(map.values());
  }, [visitors]);

  const mappedIds = useMemo(() => new Set(clusters.flatMap((cluster) => cluster.ids)), [clusters]);
  const unmappedCount = visitors.filter((visitor) => !mappedIds.has(visitor.id)).length;
  const selectedVisitor = visitors.find((visitor) => visitor.id === selectedVisitorId) ?? null;
  const selectedJourney = useMemo(
    () => activity
      .filter((event) => event.session_id === selectedVisitorId)
      .slice(0, 12)
      .reverse(),
    [activity, selectedVisitorId],
  );

  const recentHistory = useMemo(() => activity.slice(0, 80), [activity]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div className="z-20 grid grid-cols-2 gap-px border-b border-border bg-border lg:grid-cols-5">
        <KpiCard label="Online agora" value={visitors.length} icon={Users} sub="presença nos últimos 90 s" color="text-success" pulse />
        <KpiCard label="Vendo produtos" value={visitors.filter((v) => v.funnel_stage === "product_view").length} icon={Eye} sub="interesse ativo" color="text-primary" />
        <KpiCard label="No carrinho" value={visitors.filter((v) => v.funnel_stage === "cart").length} icon={ShoppingBag} sub="potenciais vendas" color="text-warning" />
        <KpiCard label="No checkout" value={visitors.filter((v) => v.funnel_stage === "checkout").length} icon={CreditCard} sub="etapa de pagamento" color="text-plum" />
        <KpiCard
          label={`Receita ${period === "today" ? "hoje" : period}`}
          value={formatBRL(((period === "today" ? stats?.revenueToday : stats?.revenuePeriod) || 0) / 100)}
          icon={TrendingUp}
          sub={period === "today" ? `${stats?.ordersToday || 0} pedidos pagos` : "compras confirmadas"}
          color="text-success"
        />
      </div>

      <div className="relative grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-4">
        {notifications && notifications.length > 0 && (
          <div className="absolute right-4 top-4 z-50 flex max-h-[360px] w-80 flex-col overflow-hidden rounded-2xl border border-primary/15 bg-background/90 shadow-elegant backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-border bg-primary/5 p-3">
              <h4 className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em]">
                <Bell className="h-3.5 w-3.5 text-primary" /> Alertas do operador
              </h4>
              <Badge variant="secondary" className="h-5 text-[9px]">{notifications.length}</Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="space-y-1.5 p-2">
                {notifications.map((notification: any) => (
                  <div key={notification.id} className="rounded-xl border border-border/70 bg-card/80 p-2.5 transition hover:border-primary/20">
                    <div className="flex gap-2.5">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.type === "cart_active" ? "bg-warning" : notification.type === "checkout_active" ? "bg-plum" : "bg-primary"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold leading-tight">{notification.title}</p>
                        <p className="mt-1 line-clamp-2 text-[9px] text-muted-foreground">{notification.content}</p>
                        <div className="mt-2 flex items-center gap-3">
                          <button className="text-[9px] font-medium text-primary hover:underline" onClick={() => setSelectedVisitorId(notification.session_id)}>
                            Ver jornada
                          </button>
                          <button className="inline-flex items-center text-[9px] text-muted-foreground hover:text-foreground" onClick={() => markReadMutation.mutate(notification.id)}>
                            <Check className="mr-0.5 h-3 w-3" /> Lida
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex h-full flex-col overflow-hidden border-r border-border bg-card/35 lg:col-span-1">
          <div className="border-b border-border bg-card/80 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                  {streamMode === "live" ? <Radio className="h-3.5 w-3.5 text-success" /> : <History className="h-3.5 w-3.5 text-primary" />}
                  {streamMode === "live" ? "Fluxo ao vivo" : "Histórico de ações"}
                </h3>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {streamMode === "live" ? `${visitors.length} visitantes ativos` : `${recentHistory.length} ações recentes no período`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Exportar histórico" onClick={handleExport}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-[10px]">
                      <Filter className="h-3 w-3" /> {period.toUpperCase()}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setPeriod("today")}>Hoje</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod("24h")}>24h</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod("7d")}>7 dias</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPeriod("30d")}>30 dias</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 rounded-xl bg-secondary/70 p-1">
              <button
                type="button"
                onClick={() => setStreamMode("live")}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${streamMode === "live" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
              >
                Ao vivo
              </button>
              <button
                type="button"
                onClick={() => setStreamMode("history")}
                className={`rounded-lg px-3 py-1.5 text-[10px] font-medium transition ${streamMode === "history" ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground"}`}
              >
                Histórico
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {streamMode === "live" ? (
              <>
                {visitors.map((visitor) => (
                  <ActivityItem key={visitor.id} visitor={visitor} selected={visitor.id === selectedVisitorId} onClick={() => setSelectedVisitorId(visitor.id)} />
                ))}
                {visitors.length === 0 && !loading && (
                  <EmptyState icon={Globe} title="Sem visitantes online" text="As jornadas anteriores continuam disponíveis em Histórico." />
                )}
              </>
            ) : (
              <>
                {recentHistory.map((event) => (
                  <HistoryItem key={event.id} event={event} selected={event.session_id === selectedVisitorId} onClick={() => setSelectedVisitorId(event.session_id)} />
                ))}
                {recentHistory.length === 0 && (
                  <EmptyState icon={History} title="Sem ações no período" text="Novas navegações e ações comerciais aparecerão aqui." />
                )}
              </>
            )}
          </div>
        </div>

        <div className="relative flex flex-col overflow-hidden bg-[#110d12] lg:col-span-3">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(109,64,95,0.22),transparent_45%),linear-gradient(145deg,#171117_0%,#100d12_55%,#0c0a0d_100%)]" />
          <div className="pointer-events-none absolute inset-x-[18%] top-[12%] h-[58%] rounded-full border border-white/[0.035]" />
          <div className="pointer-events-none absolute inset-x-[30%] top-[23%] h-[36%] rounded-full border border-primary/[0.05]" />

          <div className="relative flex-1">
            <ComposableMap projection="geoMercator" projectionConfig={{ scale: 900, center: [-55, -15] }} style={{ width: "100%", height: "100%" }}>
              <ZoomableGroup zoom={1} maxZoom={8}>
                <Geographies geography={geoUrl}>
                  {({ geographies }) => (
                    geographies.length > 0 ? geographies.map((geo) => (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill="rgba(168,144,174,0.075)"
                        stroke="rgba(233,221,223,0.20)"
                        strokeWidth={0.45}
                        style={{
                          default: { outline: "none" },
                          hover: { fill: "rgba(198,75,118,0.14)", outline: "none" },
                          pressed: { fill: "rgba(198,75,118,0.18)", outline: "none" },
                        }}
                      />
                    )) : (
                      <text x="400" y="300" textAnchor="middle" fill="rgba(255,255,255,0.5)" style={{ fontSize: 12 }}>
                        Mapa geográfico indisponível
                      </text>
                    )
                  )}
                </Geographies>

                {clusters.map((cluster) => {
                  const style = STAGE_STYLE[cluster.stage];
                  const selected = selectedVisitorId ? cluster.ids.includes(selectedVisitorId) : false;
                  const radius = 5.5 + Math.min(cluster.count, 6) * 0.7;
                  return (
                    <Marker key={`${cluster.lat}-${cluster.lon}`} coordinates={[cluster.lon, cluster.lat]}>
                      <g className="cursor-pointer" onClick={() => setSelectedVisitorId(cluster.ids[0])}>
                        <circle r={radius + (selected ? 9 : 6)} fill={style.halo} className={selected ? "animate-pulse" : ""} />
                        <circle r={radius + 2.5} fill="none" stroke={style.fill} strokeOpacity={selected ? 0.72 : 0.28} strokeWidth={selected ? 1.2 : 0.7} />
                        <circle r={radius} fill={style.fill} stroke="rgba(255,255,255,0.88)" strokeWidth={1.1} />
                        <text textAnchor="middle" y={2.5} style={{ fontSize: 7.5, fill: "#fff", fontWeight: 700, pointerEvents: "none" }}>
                          {cluster.count}
                        </text>
                      </g>
                    </Marker>
                  );
                })}
              </ZoomableGroup>
            </ComposableMap>

            <div className="absolute left-5 top-5 flex flex-wrap items-center gap-2 text-[9px] text-white/60">
              <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 backdrop-blur-md">Arraste para mover · scroll para zoom</span>
              {unmappedCount > 0 && (
                <span className="rounded-full border border-warning/20 bg-warning/10 px-3 py-1.5 text-warning backdrop-blur-md">
                  {unmappedCount} online sem coordenada aproximada
                </span>
              )}
            </div>

            <div className="absolute bottom-5 right-5 rounded-2xl border border-white/[0.08] bg-black/35 p-3.5 text-[9px] text-white/70 shadow-2xl backdrop-blur-xl">
              <p className="mb-2 text-[8px] font-semibold uppercase tracking-[0.16em] text-white/45">Etapa mais avançada</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {(Object.keys(STAGE_STYLE) as FunnelStage[]).map((stage) => (
                  <div key={stage} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_STYLE[stage].fill }} />
                    {STAGE_STYLE[stage].label}
                  </div>
                ))}
              </div>
            </div>

            {selectedVisitorId && (
              <JourneyPanel
                visitor={selectedVisitor}
                journey={selectedJourney}
                allActivity={activity}
                onClose={() => setSelectedVisitorId(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, sub, color = "text-foreground", pulse = false }: any) {
  return (
    <Card className="group cursor-default rounded-none border-none bg-card/65 shadow-none transition-colors hover:bg-card">
      <CardContent className="flex items-center gap-3 p-3.5 lg:p-4">
        <div className={`relative rounded-xl border border-border/70 bg-background/70 p-2.5 ${color}`}>
          {pulse && <span className="absolute inset-0 rounded-xl bg-success/10 animate-pulse" />}
          <Icon className="relative h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[9px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className={`mt-0.5 truncate font-display text-xl font-semibold ${color}`}>{value}</p>
          <p className="truncate text-[9px] text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ visitor, selected, onClick }: { visitor: VisitorSession; selected: boolean; onClick: () => void }) {
  const stage = STAGE_STYLE[visitor.funnel_stage];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition-all ${selected ? "border-primary/35 bg-primary/5 shadow-soft" : "border-border/60 bg-card/45 hover:border-primary/20 hover:bg-card/80"}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {visitor.device_type === "mobile" ? <Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Monitor className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate text-[10px] font-semibold">{formatLocation(visitor.city, visitor.state, visitor.country)}</span>
        </div>
        <Badge variant="outline" className={`h-4 shrink-0 px-1.5 text-[8px] ${stage.text}`}>{stage.label}</Badge>
      </div>
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
        <MapPin className="h-3 w-3 shrink-0" />
        <span className="truncate">{visitor.current_page || "/"}</span>
      </div>
      <div className="mt-2 flex items-center justify-between text-[8px] text-muted-foreground/80">
        <span className="inline-flex items-center gap-1 text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" /> online</span>
        <span>{formatTime(visitor.last_seen_at)}</span>
      </div>
    </button>
  );
}

function HistoryItem({ event, selected, onClick }: { event: AnalyticsActivity; selected: boolean; onClick: () => void }) {
  const session = getActivitySession(event);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-primary/35 bg-primary/5" : "border-border/60 bg-card/45 hover:border-primary/20 hover:bg-card/80"}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 rounded-lg bg-secondary p-1.5 text-primary"><EventIcon eventName={event.event_name} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-semibold">{eventLabel(event.event_name)}</p>
            <span className="shrink-0 text-[8px] text-muted-foreground">{formatTime(event.created_at)}</span>
          </div>
          <p className="mt-1 truncate text-[9px] text-muted-foreground">{event.product_name || event.page_path || "Ação na loja"}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[8px] text-muted-foreground/80">
            <span className="truncate">{formatLocation(session?.city, session?.state, session?.country)}</span>
            <span className={session?.is_online ? "text-success" : "text-muted-foreground"}>{session?.is_online ? "online" : "histórico"}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function JourneyPanel({
  visitor,
  journey,
  allActivity,
  onClose,
}: {
  visitor: VisitorSession | null;
  journey: AnalyticsActivity[];
  allActivity: AnalyticsActivity[];
  onClose: () => void;
}) {
  const fallbackEvent = allActivity.find((event) => journey.some((row) => row.id === event.id)) ?? journey[journey.length - 1];
  const fallbackSession = fallbackEvent ? getActivitySession(fallbackEvent) : null;
  const online = !!visitor;
  const location = visitor
    ? formatLocation(visitor.city, visitor.state, visitor.country)
    : formatLocation(fallbackSession?.city, fallbackSession?.state, fallbackSession?.country);

  return (
    <div className="absolute bottom-5 left-5 z-20 w-[min(390px,calc(100%-2.5rem))] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#181218]/92 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${online ? "bg-[#2F8B6D]" : "bg-white/30"}`} />
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]">Jornada do cliente</p>
          </div>
          <p className="mt-1.5 text-[10px] text-white/50">{location}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/45 transition hover:bg-white/5 hover:text-white" aria-label="Fechar jornada">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[260px] overflow-y-auto p-4">
        {journey.length > 0 ? (
          <div className="relative space-y-3 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-white/10">
            {journey.map((event, index) => (
              <div key={event.id} className="relative flex gap-3">
                <span className={`relative z-10 mt-1 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border ${index === journey.length - 1 ? "border-primary bg-primary" : "border-white/20 bg-[#181218]"}`}>
                  <span className="h-1 w-1 rounded-full bg-white" />
                </span>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-medium">{eventLabel(event.event_name)}</p>
                    <span className="text-[8px] text-white/40">{formatTime(event.created_at)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[9px] text-white/45">{event.product_name || event.page_path || "Ação na loja"}</p>
                  {event.event_name === "purchase" && event.value_cents ? (
                    <p className="mt-1 text-[9px] font-medium text-[#76bba4]">{formatBRL(event.value_cents / 100)}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-5 text-center">
            <Clock3 className="mx-auto h-5 w-5 text-white/25" />
            <p className="mt-2 text-[10px] text-white/45">A sessão está online, mas ainda não há ações históricas carregadas neste período.</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2.5 text-[8px] text-white/40">
        <span>{online ? "Presença ativa no mapa" : "Sessão encerrada · histórico preservado"}</span>
        <span>{journey.length} ações exibidas</span>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, text }: { icon: typeof Globe; title: string; text: string }) {
  return (
    <div className="px-4 py-16 text-center">
      <Icon className="mx-auto h-8 w-8 text-muted-foreground/30" />
      <p className="mt-3 text-[11px] font-medium text-muted-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-[210px] text-[9px] leading-relaxed text-muted-foreground/70">{text}</p>
    </div>
  );
}
