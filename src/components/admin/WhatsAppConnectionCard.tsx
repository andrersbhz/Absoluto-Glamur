import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, LogOut, QrCode, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getWhatsAppConnectionStatus,
  restartWhatsAppConnection,
  logoutWhatsAppConnection,
  type WhatsAppConnectionStatus,
} from "@/lib/whatsapp.functions";

const initialStatus: WhatsAppConnectionStatus = {
  state: "starting",
  qr: null,
  number: null,
  error: null,
};

export function WhatsAppConnectionCard() {
  const [status, setStatus] = useState<WhatsAppConnectionStatus>(initialStatus);
  const [busy, setBusy] = useState(false);
  const getStatus = useServerFn(getWhatsAppConnectionStatus);
  const restart = useServerFn(restartWhatsAppConnection);
  const logout = useServerFn(logoutWhatsAppConnection);

  async function refresh(silent = false) {
    try {
      const next = await getStatus();
      setStatus(next);
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Falha ao consultar WhatsApp");
    }
  }

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(true), 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleRestart() {
    setBusy(true);
    try {
      const result = await restart();
      if (result?.ok) {
        toast.success("Conexão reiniciada. Aguarde o QR Code.");
      } else {
        toast.error(result?.error || "Não foi possível reiniciar");
      }
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reiniciar");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    try {
      const result = await logout();
      if (result?.ok) {
        toast.success("WhatsApp desconectado");
      } else {
        toast.error(result?.error || "Não foi possível desconectar");
      }
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível desconectar");
    } finally {
      setBusy(false);
    }
  }

  const connected = status.state === "connected";

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg">Conexão WhatsApp Web</h2>
            {connected ? (
              <Badge className="gap-1 bg-emerald-600 text-white"><CheckCircle2 className="h-3 w-3" />Conectado</Badge>
            ) : status.state === "qr" ? (
              <Badge variant="secondary" className="gap-1"><QrCode className="h-3 w-3" />Aguardando QR</Badge>
            ) : (
              <Badge variant="outline" className="gap-1"><WifiOff className="h-3 w-3" />{status.state}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Conexão por QR Code via WhatsApp Web. Não utiliza a API oficial da Meta.
          </p>
          {status.number && <p className="mt-2 text-sm font-medium">Número conectado: +{status.number}</p>}
          {status.error && <p className="mt-2 text-sm text-destructive">{status.error}</p>}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => refresh()} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" />Atualizar
          </Button>
          {connected ? (
            <Button variant="destructive" onClick={handleLogout} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
              Desconectar
            </Button>
          ) : (
            <Button onClick={handleRestart} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              Gerar novo QR
            </Button>
          )}
        </div>
      </div>

      {status.qr && (
        <div className="mt-4 flex flex-col items-center rounded-xl border border-dashed border-border bg-background/50 p-5 text-center">
          <img src={status.qr} alt="QR Code do WhatsApp" className="h-64 w-64 rounded-lg bg-white p-2" />
          <p className="mt-3 text-sm font-medium">No celular: WhatsApp → Aparelhos conectados → Conectar aparelho</p>
          <p className="mt-1 text-xs text-muted-foreground">O QR é atualizado automaticamente. Não compartilhe esta tela.</p>
        </div>
      )}
    </section>
  );
}
