import React, { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  MapPin, 
  ShoppingBag, 
  ArrowUpRight, 
  Globe,
  Smartphone,
  Monitor,
  Eye,
  CreditCard,
  TrendingUp,
  Filter,
  ChevronDown,
  LayoutGrid,
  Bell,
  Check,
  Download,
  AlertTriangle
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { 
  getAnalyticsStats, 
  getOperatorNotifications, 
  markNotificationRead,
  exportAnalyticsCsv 
} from "@/lib/analytics.functions";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup
} from "react-simple-maps";

// URL para o GeoJSON do Brasil (estados)
const geoUrl = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

interface VisitorSession {
  id: string;
  city: string | null;
  state: string | null;
  country: string | null;
  current_page: string | null;
  funnel_stage: 'browsing' | 'product_view' | 'cart' | 'checkout' | 'purchased';
  is_online: boolean;
  device_type: string | null;
  last_seen_at: string;
  latitude: number | null;
  longitude: number | null;
}

export default function LiveMapView() {
  const [visitors, setVisitors] = useState<VisitorSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"today" | "24h" | "7d" | "30d">("today");
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  
  const statsFn = useServerFn(getAnalyticsStats);
  const notificationsFn = useServerFn(getOperatorNotifications);
  const markReadFn = useServerFn(markNotificationRead);
  const exportFn = useServerFn(exportAnalyticsCsv);

  const { data: stats } = useQuery({
    queryKey: ["analytics-stats", period],
    queryFn: () => statsFn({ data: { period } }),
    refetchInterval: 10000 
  });

  const { data: notifications } = useQuery({
    queryKey: ["operator-notifications"],
    queryFn: () => notificationsFn({ data: undefined }),
    refetchInterval: 5000
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markReadFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["operator-notifications"] });
    }
  });

  useEffect(() => {
    const fetchInitial = async () => {
      const { data, error } = await supabase
        .from("visitor_sessions")
        .select("*")
        .eq("is_online", true)
        .order("last_seen_at", { ascending: false });

      if (!error && data) {
        setVisitors(data as any);
      }
      setLoading(false);
    };

    fetchInitial();

    const channel = supabase
      .channel("live_visitors_map_v2")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newV = payload.new as any;
            if (newV.is_online) {
              setVisitors(prev => {
                if (prev.some(v => v.id === newV.id)) return prev;
                return [newV, ...prev];
              });
            }
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as any;
            if (!updated.is_online) {
              setVisitors(prev => prev.filter(v => v.id !== updated.id));
            } else {
              setVisitors(prev => {
                const exists = prev.some(v => v.id === updated.id);
                if (exists) return prev.map(v => v.id === updated.id ? { ...v, ...updated } : v);
                return [updated, ...prev];
              });
            }
          } else if (payload.eventType === "DELETE") {
            setVisitors(prev => prev.filter(v => v.id !== payload.old.id));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "operator_notifications" },
        (payload) => {
          const audio = document.getElementById("whatsapp-alert") as HTMLAudioElement;
          if (audio) audio.play().catch(() => {});
          toast.info(payload.new.title, {
            description: payload.new.content,
            action: {
              label: "Ver no Mapa",
              onClick: () => setSelectedVisitorId(payload.new.session_id)
            }
          });
          queryClient.invalidateQueries({ queryKey: ["operator-notifications"] });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const handleExport = async () => {
    try {
      const { csv, filename } = await exportFn({ data: { period } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Exportação concluída!");
    } catch (e) {
      toast.error("Erro ao exportar dados");
    }
  };

  const clusters = useMemo(() => {
    const map = new Map<string, { lat: number, lon: number, count: number, stage: string, ids: string[] }>();
    visitors.forEach(v => {
      if (!v.latitude || !v.longitude) return;
      // Precisão menor para agrupar melhor
      const lat = Math.round(v.latitude * 10) / 10;
      const lon = Math.round(v.longitude * 10) / 10;
      const key = `${lat}-${lon}`;
      const cur = map.get(key) || { lat, lon, count: 0, stage: v.funnel_stage, ids: [] };
      cur.count += 1;
      cur.ids.push(v.id);
      if (['purchased', 'checkout', 'cart'].indexOf(v.funnel_stage) > ['purchased', 'checkout', 'cart'].indexOf(cur.stage)) {
        cur.stage = v.funnel_stage;
      }
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [visitors]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Top Header - Resumo em Tempo Real */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-border border-b border-border z-20">
        <KpiCard 
          label="Online Agora" 
          value={visitors.length} 
          icon={Users} 
          sub="Visitantes ativos"
          trend="pulse"
          onClick={() => setPeriod("24h")}
        />
        <KpiCard 
          label="Vendo Produtos" 
          value={visitors.filter(v => v.funnel_stage === 'product_view').length} 
          icon={Eye} 
          sub="Interessados"
        />
        <KpiCard 
          label="No Carrinho" 
          value={visitors.filter(v => v.funnel_stage === 'cart').length} 
          icon={ShoppingBag} 
          sub="Potenciais vendas"
          color="text-yellow-500"
          alert={visitors.filter(v => v.funnel_stage === 'cart').length > 0}
        />
        <KpiCard 
          label="No Checkout" 
          value={visitors.filter(v => v.funnel_stage === 'checkout').length} 
          icon={CreditCard} 
          sub="Quase lá"
          color="text-blue-500"
        />
        <KpiCard 
          label={`Receita ${period === 'today' ? 'Hoje' : period}`} 
          value={formatBRL(((period === 'today' ? stats?.revenueToday : stats?.revenuePeriod) || 0) / 100)} 
          icon={TrendingUp} 
          sub={`${stats?.ordersToday || 0} pedidos`}
          color="text-green-500"
        />
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden relative">
        {/* Notificações Floating (Direita superior do mapa) */}
        {notifications && notifications.length > 0 && (
          <div className="absolute top-4 right-4 z-50 w-80 max-h-[400px] overflow-hidden rounded-2xl border border-primary/20 bg-background/80 backdrop-blur-xl shadow-2xl flex flex-col">
            <div className="p-3 border-b border-border bg-primary/5 flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                <Bell className="h-3 w-3 text-primary" /> Alertas Operador
              </h4>
              <Badge variant="secondary" className="text-[9px] h-4">{notifications.length}</Badge>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {notifications.map((n: any) => (
                  <div key={n.id} className="p-2 rounded-lg border border-border bg-card/50 hover:bg-card transition-colors group relative">
                    <div className="flex gap-3">
                      <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                        n.type === 'cart_active' ? 'bg-yellow-500' : 
                        n.type === 'checkout_active' ? 'bg-blue-500' : 'bg-primary'
                      }`} />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-semibold leading-tight">{n.title}</p>
                        <p className="text-[9px] text-muted-foreground line-clamp-2 mt-0.5">{n.content}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Button 
                            variant="link" 
                            size="sm" 
                            className="h-auto p-0 text-[9px] text-primary"
                            onClick={() => setSelectedVisitorId(n.session_id)}
                          >
                            Ver no Mapa
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-auto p-0 text-[9px] text-muted-foreground hover:text-foreground"
                            onClick={() => markReadMutation.mutate(n.id)}
                          >
                            <Check className="h-3 w-3 mr-0.5" /> Lida
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Sidebar: Activity Stream */}
        <div className="lg:col-span-1 border-r border-border flex flex-col h-full bg-card/20 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between bg-card/50">
            <div className="flex flex-col">
              <h3 className="font-semibold text-xs uppercase tracking-wider flex items-center gap-2">
                <LayoutGrid className="h-3 w-3" /> Fluxo ao Vivo
              </h3>
              <p className="text-[9px] text-muted-foreground mt-0.5">{visitors.length} usuários online</p>
            </div>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                title="Exportar dados do período"
                onClick={handleExport}
              >
                <Download className="h-3 w-3" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1">
                    <Filter className="h-3 w-3" /> {period.toUpperCase()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setPeriod("today")}>Hoje</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPeriod("24h")}>24h</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPeriod("7d")}>7d</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPeriod("30d")}>30d</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {visitors.map((visitor) => (
              <ActivityItem key={visitor.id} visitor={visitor} />
            ))}
            {visitors.length === 0 && !loading && (
              <div className="text-center py-20 opacity-30">
                <Globe className="h-10 w-10 mx-auto mb-3" />
                <p className="text-xs">Aguardando tráfego...</p>
              </div>
            )}
          </div>
        </div>

        {/* Map & Clusters 2D */}
        <div className="lg:col-span-3 relative bg-[#0a0a0a] overflow-hidden flex flex-col">
          {/* Fundo do mapa com efeito radar decorativo */}
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-primary/20 rounded-full animate-[ping_15s_infinite]" />
          </div>

          <div className="flex-1 relative">
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{
                scale: 800,
                center: [-55, -15] 
              }}
              style={{ width: "100%", height: "100%" }}
            >
              <ZoomableGroup 
                zoom={1} 
                maxZoom={8}
                translateExtent={[
                  [0, 0],
                  [800, 600]
                ]}
              >
                <Geographies geography={geoUrl}>
                  {({ geographies }) =>
                    geographies && geographies.length > 0 ? (
                      geographies.map((geo) => (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill="transparent"
                          stroke="hsl(var(--primary))"
                          strokeWidth={1.5}
                          style={{
                            default: { outline: "none" },
                            hover: { fill: "hsl(var(--primary) / 0.1)", outline: "none" },
                            pressed: { outline: "none" },
                          }}
                        />
                      ))
                    ) : null
                  }
                </Geographies>

                {clusters.map((c, i) => (
                  <Marker key={i} coordinates={[c.lon, c.lat]}>
                    <g 
                      className={`cursor-pointer transition-all duration-300 ${selectedVisitorId && c.ids.includes(selectedVisitorId) ? 'scale-150' : ''}`}
                      onClick={() => setSelectedVisitorId(c.ids[0])}
                    >
                      {/* Efeito de radar/ping ao redor da bolinha */}
                      <circle
                        r={8 + (Math.min(c.count, 5))}
                        fill={
                          c.stage === 'purchased' ? 'rgba(34, 197, 94, 0.4)' : 
                          c.stage === 'checkout' ? 'rgba(59, 130, 246, 0.4)' :
                          c.stage === 'cart' ? 'rgba(234, 179, 8, 0.4)' : 'rgba(217, 70, 239, 0.3)'
                        }
                        className="animate-ping"
                      />
                      
                      <circle
                        r={6 + (Math.min(c.count, 5))}
                        fill={
                          c.stage === 'purchased' ? 'rgb(34, 197, 94)' : 
                          c.stage === 'checkout' ? 'rgb(59, 130, 246)' :
                          c.stage === 'cart' ? 'rgb(234, 179, 8)' : 'rgb(217, 70, 239)'
                        }
                        stroke="#fff"
                        strokeWidth={1.5}
                        className={selectedVisitorId && c.ids.includes(selectedVisitorId) ? 'animate-bounce' : ''}
                      />
                      
                      <text
                        textAnchor="middle"
                        y={2.5}
                        style={{ fontSize: "8px", fill: "#fff", fontWeight: "bold", pointerEvents: "none" }}
                      >
                        {c.count}
                      </text>
                    </g>
                  </Marker>
                ))}
              </ZoomableGroup>
            </ComposableMap>

            {/* Legenda */}
            <div className="absolute bottom-6 right-6 p-4 rounded-xl border border-white/5 bg-black/60 backdrop-blur-xl text-[10px] space-y-2 z-10 shadow-2xl">
              <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-primary" /> Navegando</div>
              <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-yellow-500" /> Carrinho</div>
              <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-blue-500" /> Checkout</div>
              <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-green-500" /> Compra</div>
            </div>
            
            <div className="absolute top-6 left-6 text-[10px] text-muted-foreground bg-black/40 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-md">
              Dica: Use o mouse para arrastar e scroll para zoom no mapa
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, sub, color = "text-foreground", trend, alert, onClick }: any) {
  return (
    <Card 
      className={`rounded-none border-none shadow-none bg-card/40 hover:bg-card/60 transition-colors cursor-pointer group`}
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col items-center text-center">
        <div className={`mb-2 p-2 rounded-full bg-background/50 border border-border/50 ${color} group-hover:scale-110 transition-transform`}>
          <Icon className={`h-4 w-4 ${trend === 'pulse' ? 'animate-pulse' : ''}`} />
        </div>
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-2">
          <p className={`text-xl font-display font-semibold ${color}`}>{value}</p>
          {alert && <div className="h-2 w-2 rounded-full bg-red-500 animate-ping" title="Ação necessária!" />}
        </div>
        <p className="text-[9px] text-muted-foreground mt-1 italic">{sub}</p>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ visitor }: { visitor: VisitorSession }) {
  return (
    <div className="p-3 rounded-xl border border-border/50 bg-card/30 hover:border-primary/30 transition-all group relative overflow-hidden">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 overflow-hidden">
          {visitor.device_type === 'mobile' ? (
            <Smartphone className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <Monitor className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          <span className="text-[10px] font-semibold truncate">
            {visitor.city || "Brasília"}, {visitor.state || "DF"}
          </span>
        </div>
        <Badge variant="outline" className={`text-[8px] h-4 px-1 ${
          visitor.funnel_stage === 'purchased' ? 'border-green-500/50 text-green-500' :
          visitor.funnel_stage === 'checkout' ? 'border-blue-500/50 text-blue-500' :
          visitor.funnel_stage === 'cart' ? 'border-yellow-500/50 text-yellow-500' : 'border-primary/50 text-primary'
        }`}>
          {visitor.funnel_stage.replace('_', ' ')}
        </Badge>
      </div>
      
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
        <MapPin className="h-2.5 w-2.5" />
        <span className="truncate max-w-[150px]">{visitor.current_page || "/"}</span>
      </div>

      <div className="absolute bottom-0 left-0 h-0.5 bg-primary/20 w-full transform origin-left transition-transform duration-500 group-hover:scale-x-110" />
    </div>
  );
}
