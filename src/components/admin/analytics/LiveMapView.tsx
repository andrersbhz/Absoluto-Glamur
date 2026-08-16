import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  MapPin, 
  ShoppingBag, 
  ArrowUpRight, 
  Globe,
  Smartphone,
  Monitor
} from "lucide-react";

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
}

export default function LiveMapView() {
  const [visitors, setVisitors] = useState<VisitorSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Carga inicial
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

    // 2. Assinatura Realtime
    const channel = supabase
      .channel("live_visitors")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "visitor_sessions" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setVisitors(prev => [payload.new as any, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setVisitors(prev => 
              prev.map(v => v.id === payload.new.id ? { ...v, ...payload.new } : v)
            );
          } else if (payload.eventType === "DELETE") {
            setVisitors(prev => prev.filter(v => v.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onlineCount = visitors.filter(v => v.is_online).length;

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-4 gap-0 overflow-hidden bg-background">
      {/* Sidebar: Lista de Atividade */}
      <div className="lg:col-span-1 border-r border-border flex flex-col h-full bg-card/30">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Visitantes Agora</h3>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 animate-pulse">
            {onlineCount} Online
          </Badge>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {visitors.map((visitor) => (
            <div 
              key={visitor.id} 
              className="p-3 rounded-lg border border-border bg-background/50 hover:border-primary/50 transition-colors group"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {visitor.device_type === 'mobile' ? (
                    <Smartphone className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <Monitor className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="text-xs font-medium truncate max-w-[120px]">
                    {visitor.city || "Localização desconhecida"}
                  </span>
                </div>
                <Badge variant="outline" className="text-[9px] uppercase tracking-tighter h-4 px-1">
                  {visitor.funnel_stage}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground truncate mb-1">
                {visitor.current_page || "/"}
              </p>
              <div className="flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] text-muted-foreground">Ativo agora</span>
              </div>
            </div>
          ))}

          {visitors.length === 0 && !loading && (
            <div className="text-center py-10 opacity-50">
              <Globe className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-xs">Nenhum visitante ativo</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content: Mapa e Resumo */}
      <div className="lg:col-span-3 relative flex flex-col h-full">
        {/* Radar Map Placeholder (Futuro: Leaflet) */}
        <div className="flex-1 bg-[url('https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/0,0,1,0,0/1200x800?access_token=pk.placeholder')] bg-cover bg-center flex items-center justify-center">
           <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px]" />
           
           <div className="relative z-10 text-center p-8 rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl">
             <div className="relative inline-block mb-6">
               <div className="absolute inset-0 animate-ping rounded-full bg-primary/20 scale-150" />
               <div className="relative h-24 w-24 rounded-full border-2 border-primary/50 flex items-center justify-center bg-background/80 shadow-[0_0_30px_rgba(var(--primary),0.2)]">
                 <Globe className="h-12 w-12 text-primary animate-pulse" />
               </div>
             </div>
             <h2 className="text-xl font-display text-foreground mb-2">Visualização Geográfica</h2>
             <p className="text-sm text-muted-foreground max-w-sm mx-auto">
               Em breve: Mapa vetorial interativo com densidade de calor por região.
             </p>
           </div>
        </div>

        {/* Bottom Panel: Funnel KPIs */}
        <div className="p-6 border-t border-border bg-card/50 grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatMini 
            label="Visualizando" 
            value={visitors.filter(v => v.funnel_stage === 'browsing' || v.funnel_stage === 'product_view').length} 
            icon={MapPin}
          />
          <StatMini 
            label="Carrinho" 
            value={visitors.filter(v => v.funnel_stage === 'cart').length} 
            icon={ShoppingBag}
            color="text-yellow-500"
          />
          <StatMini 
            label="Checkout" 
            value={visitors.filter(v => v.funnel_stage === 'checkout').length} 
            icon={ArrowUpRight}
            color="text-blue-500"
          />
          <StatMini 
            label="Convertidos" 
            value={visitors.filter(v => v.funnel_stage === 'purchased').length} 
            icon={Badge}
            color="text-green-500"
          />
        </div>
      </div>
    </div>
  );
}

function StatMini({ label, value, icon: Icon, color = "text-primary" }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg bg-background/50 border border-border ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none mb-1">{label}</p>
        <p className="text-lg font-semibold leading-none">{value}</p>
      </div>
    </div>
  );
}
