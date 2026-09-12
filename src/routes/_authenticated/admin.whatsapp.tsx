import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { WhatsAppConnectionCard } from "@/components/admin/WhatsAppConnectionCard";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  Search,
  Send,
  Paperclip,
  User,
  Clock,
  CheckCheck,
  MoreVertical,
  MessageSquare,
  AlertCircle,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  claimConversation,
  sendWhatsAppMessage,
  finishConversation,
  addInternalNote,
} from "@/lib/whatsapp.functions";

export const Route = createFileRoute("/_authenticated/admin/whatsapp")({
  head: () => ({ meta: [{ title: "Central de Atendimento WhatsApp" }] }),
  component: WhatsAppAdmin,
});

function WhatsAppAdmin() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const claimConvFn = useServerFn(claimConversation);
  const sendMessageFn = useServerFn(sendWhatsAppMessage);
  const finishConvFn = useServerFn(finishConversation);
  const addNoteFn = useServerFn(addInternalNote);

  useEffect(() => {
    fetchConversations();

    const channel = supabase
      .channel("whatsapp_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversations" },
        () => fetchConversations(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages" },
        (payload) => {
          if (payload.new.conversation_id === activeId) {
            setMessages((prev) => [...prev, payload.new]);
          }
          if (payload.new.direction === "inbound") {
            playAlert();
            toast.info("Nova mensagem recebida no WhatsApp");
            fetchConversations();
          }
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [activeId]);

  useEffect(() => {
    if (activeId) fetchMessages(activeId);
  }, [activeId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchConversations() {
    const { data } = await supabase
      .from("whatsapp_conversations")
      .select("*, contacts:whatsapp_contacts(*)")
      .order("last_message_at", { ascending: false });
    if (data) setConversations(data);
  }

  async function fetchMessages(convId: string) {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (data) setMessages(data);
  }

  const playAlert = () => {
    const audio = document.getElementById("whatsapp-alert") as HTMLAudioElement;
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => undefined);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !activeId) return;
    try {
      await sendMessageFn({ data: { conversationId: activeId, content: input } });
      setInput("");
      toast.success("Mensagem enviada para a fila do WhatsApp");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar mensagem");
    }
  };

  const handleClaim = async (id: string) => {
    try {
      await claimConvFn({ data: { conversationId: id } });
      setActiveId(id);
      toast.success("Atendimento assumido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível assumir a conversa");
    }
  };

  const handleFinish = async () => {
    if (!activeId) return;
    try {
      await finishConvFn({ data: { conversationId: activeId } });
      toast.success("Atendimento finalizado");
      await fetchConversations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível finalizar");
    }
  };

  const handleAddNote = async () => {
    if (!activeId || !noteInput.trim()) return;
    try {
      await addNoteFn({ data: { conversationId: activeId, content: noteInput } });
      setNoteInput("");
      toast.success("Nota interna adicionada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar a nota");
    }
  };

  const activeConv = conversations.find((c) => c.id === activeId);

  return (
    <AdminLayout>
      <WhatsAppConnectionCard />

      <div className="flex min-h-[560px] flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex w-80 flex-col border-r border-border">
          <div className="p-4">
            <h2 className="font-display text-lg">Atendimento</h2>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar conversas..." className="pl-9" />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveId(conv.id)}
                  className={`flex w-full flex-col gap-1 rounded-lg p-3 text-left transition ${
                    activeId === conv.id ? "bg-primary/10 ring-1 ring-primary/20" : "hover:bg-secondary"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{conv.contacts?.name || conv.contacts?.phone}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(conv.last_message_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="line-clamp-1 text-xs text-muted-foreground">
                      {conv.status === "waiting" ? "Aguardando atendimento..." : "Clique para ver a conversa"}
                    </p>
                    {conv.status === "waiting" && <Badge className="bg-plum text-[10px] text-white">Novo</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        <div className="flex flex-1 flex-col bg-secondary/20">
          {activeId ? (
            <>
              <div className="flex h-16 items-center justify-between border-b border-border bg-card px-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <User className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-medium leading-none">{activeConv?.contacts?.name || "Contato"}</h3>
                    <p className="text-xs text-muted-foreground">{activeConv?.contacts?.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {activeConv?.status === "waiting" && (
                    <Button size="sm" onClick={() => handleClaim(activeConv.id)}>
                      Atender
                    </Button>
                  )}
                  {activeConv?.status === "in_service" && (
                    <Button size="sm" variant="outline" onClick={handleFinish}>
                      Finalizar
                    </Button>
                  )}
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6">
                <div ref={scrollRef} className="flex flex-col gap-4">
                  {messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-2xl p-3 text-sm shadow-sm ${
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground"
                            : "border border-border bg-card"
                        }`}
                      >
                        <p>{msg.content}</p>
                        <div
                          className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                            msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                          }`}
                        >
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {msg.direction === "outbound" && <CheckCheck className="h-3 w-3" />}
                          {msg.direction === "outbound" && msg.status && <span>· {msg.status}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon">
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Input
                    placeholder="Digite sua mensagem..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    disabled={activeConv?.status !== "in_service" || activeConv?.assigned_user_id !== user?.id}
                  />
                  <Button onClick={handleSend} disabled={!input.trim()}>
                    <Send className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 opacity-20" />
              <p className="mt-4">Selecione uma conversa para começar</p>
            </div>
          )}
        </div>

        {activeId && (
          <div className="hidden w-72 flex-col border-l border-border bg-card lg:flex">
            <div className="p-6 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary/20 text-primary">
                <User className="h-10 w-10" />
              </div>
              <h3 className="mt-4 font-display text-lg">{activeConv?.contacts?.name || "Contato"}</h3>
              <p className="text-sm text-muted-foreground">{activeConv?.contacts?.phone}</p>
            </div>

            <Separator />

            <div className="p-4">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3 w-3" /> Status
              </h4>
              <div className="mt-2 flex items-center justify-between">
                <Badge variant={activeConv?.status === "waiting" ? "destructive" : "secondary"}>
                  {activeConv?.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  Desde {activeConv?.created_at ? new Date(activeConv.created_at).toLocaleDateString() : "—"}
                </span>
              </div>
            </div>

            <Separator />

            <div className="flex-1 p-4">
              <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <StickyNote className="h-3 w-3" /> Notas Internas
              </h4>
              <div className="mt-4 space-y-2 rounded-lg border border-dashed border-border p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertCircle className="h-4 w-4 opacity-50" /> Visíveis apenas para a equipe.
                </div>
                <Input
                  placeholder="Adicionar nota..."
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                />
                <Button variant="outline" size="sm" className="w-full" onClick={handleAddNote} disabled={!noteInput.trim()}>
                  Adicionar nota
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
