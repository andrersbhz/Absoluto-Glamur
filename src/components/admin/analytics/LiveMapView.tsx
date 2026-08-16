import React, { useEffect, useState, useMemo } from "react";
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
  LayoutGrid
} from "lucide-react";
import { formatBRL } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAnalyticsStats } from "@/lib/analytics.functions";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

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
  const statsFn = useServerFn(getAnalyticsStats);

  const { data: stats } = useQuery({
    queryKey: ["analytics-stats", period],
    queryFn: () => statsFn({ data: { period } }),
    refetchInterval: 10000 // 10s
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
      .channel("live_visitors_map")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newV = payload.new as any;
            if (newV.is_online) setVisitors(prev => [newV, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const updated = payload.new as any;
            if (!updated.is_online) {
              setVisitors(prev => prev.filter(v => v.id !== updated.id));
            } else {
              setVisitors(prev => {
                const exists = prev.find(v => v.id === updated.id);
                if (exists) return prev.map(v => v.id === updated.id ? { ...v, ...updated } : v);
                return [updated, ...prev];
              });
            }
          } else if (payload.eventType === "DELETE") {
            setVisitors(prev => prev.filter(v => v.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Cluster simples por cidade para o mapa
  const clusters = useMemo(() => {
    const map = new Map<string, { lat: number, lon: number, count: number, stage: string }>();
    visitors.forEach(v => {
      if (!v.latitude || !v.longitude) return;
      const key = `${v.city || 'Unknown'}-${v.state || 'Unknown'}`;
      const cur = map.get(key) || { lat: v.latitude, lon: v.longitude, count: 0, stage: v.funnel_stage };
      cur.count += 1;
      // Prioridade de estágio para cor do cluster
      if (v.funnel_stage === 'purchased' || v.funnel_stage === 'checkout') cur.stage = v.funnel_stage;
      map.set(key, cur);
    });
    return Array.from(map.values());
  }, [visitors]);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Top Header - Resumo em Tempo Real */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-border border-b border-border">
        <KpiCard 
          label="Online Agora" 
          value={visitors.length} 
          icon={Users} 
          sub="Visitantes ativos"
          trend="pulse"
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
          label="Vendas Hoje" 
          value={formatBRL((stats?.revenueToday || 0) / 100)} 
          icon={TrendingUp} 
          sub={`${stats?.ordersToday || 0} pedidos`}
          color="text-green-500"
        />
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden">
        {/* Sidebar: Activity Stream */}
        <div className="lg:col-span-1 border-r border-border flex flex-col h-full bg-card/20 overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between bg-card/50">
            <h3 className="font-semibold text-xs uppercase tracking-wider flex items-center gap-2">
              <LayoutGrid className="h-3 w-3" /> Fluxo ao Vivo
            </h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1">
                  <Filter className="h-3 w-3" /> {period.toUpperCase()} <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setPeriod("today")}>Hoje</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("24h")}>Últimas 24h</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("7d")}>Últimos 7 dias</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPeriod("30d")}>Últimos 30 dias</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        {/* Map & Clusters */}
        <div className="lg:col-span-3 relative bg-[#0a0a0a] overflow-hidden">
          {/* Fundo do mapa com efeito radar */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-primary/20 rounded-full animate-[ping_10s_infinite]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-primary/10 rounded-full animate-[ping_8s_infinite]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] border border-primary/5 rounded-full animate-[ping_6s_infinite]" />
          </div>

          <div className="absolute inset-0 flex items-center justify-center p-10">
            {/* Visualização de Clusters Simplificada */}
            <div className="relative w-full h-full border border-border/20 rounded-3xl bg-black/40 backdrop-blur-sm overflow-hidden shadow-2xl">
               <div className="absolute inset-0 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/-46.63,-23.55,3,0,0/1200x800?access_token=pk.placeholder')] bg-cover opacity-40 grayscale" />
               
               {/* Marcadores de Cluster */}
               {clusters.map((c, i) => (
                 <div 
                   key={i}
                   className="absolute group transition-all duration-500"
                   style={{ 
                     left: `${50 + (c.lon * 0.5)}%`, 
                     top: `${50 - (c.lat * 0.8)}%` 
                   }}
                 >
                   <div className={`relative flex items-center justify-center h-8 w-8 rounded-full border border-white/20 backdrop-blur-md shadow-lg ${
                     c.stage === 'purchased' ? 'bg-green-500/60' : 
                     c.stage === 'checkout' ? 'bg-blue-500/60' :
                     c.stage === 'cart' ? 'bg-yellow-500/60' : 'bg-primary/40'
                   } animate-pulse`}>
                     <span className="text-[10px] font-bold text-white">{c.count}</span>
                   </div>
                 </div>
               ))}
               
               <div className="absolute bottom-6 right-6 p-4 rounded-xl border border-white/5 bg-black/60 backdrop-blur-xl text-[10px] space-y-2">
                 <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-primary" /> Navegando</div>
                 <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-yellow-500" /> Carrinho</div>
                 <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-blue-500" /> Checkout</div>
                 <div className="flex items-center gap-2"><div className="h-2 w-2 rounded-full bg-green-500" /> Compra</div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, sub, color = "text-foreground", trend, alert }: any) {
  return (
    <Card className="rounded-none border-none shadow-none bg-card/40 hover:bg-card/60 transition-colors">
      <CardContent className="p-4 flex flex-col items-center text-center">
        <div className={`mb-2 p-2 rounded-full bg-background/50 border border-border/50 ${color}`}>
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
        <Badge 
          variant="outline" 
          className={`text-[8px] uppercase tracking-tighter h-4 px-1 ${
            visitor.funnel_stage === 'checkout' ? 'border-blue-500/50 text-blue-500 bg-blue-500/5' :
            visitor.funnel_stage === 'cart' ? 'border-yellow-500/50 text-yellow-500 bg-yellow-500/5' :
            visitor.funnel_stage === 'purchased' ? 'border-green-500/50 text-green-500 bg-green-500/5' : ''
          }`}
        >
          {visitor.funnel_stage}
        </Badge>
      </div>
      <p className="text-[9px] text-muted-foreground truncate mb-2 px-1 py-0.5 rounded bg-background/50 border border-border/20">
        {visitor.current_page || "/"}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[9px] text-muted-foreground">Ativo agora</span>
        </div>
        <span className="text-[8px] text-muted-foreground/60">{new Date(visitor.last_seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
}
