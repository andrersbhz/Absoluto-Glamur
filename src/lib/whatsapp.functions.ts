import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  content: string;
  type: string;
  media_url?: string;
  status: string;
  sent_at: string;
}

export interface WhatsAppConversation {
  id: string;
  contact_id: string;
  assigned_user_id?: string;
  status: "waiting" | "in_service" | "finished" | "transferred";
  last_message_at: string;
  contacts?: {
    name: string;
    phone: string;
    profile_picture?: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertWhatsAppStaff(context: any) {
  const { data: admin } = await context.supabase.rpc("is_admin", {
    _user_id: context.userId,
  });
  if (admin) return;

  for (const role of ["support", "marketing"]) {
    const { data: allowed } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: role,
    });
    if (allowed) return;
  }
  throw new Error("Acesso restrito à equipe de atendimento");
}

const ConversationSchema = z.object({ conversationId: z.string().uuid() });

export const claimConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConversationSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertWhatsAppStaff(context);

    const { data: updated, error } = await context.supabase
      .from("whatsapp_conversations")
      .update({
        assigned_user_id: context.userId,
        status: "in_service",
        assigned_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
      })
      .eq("id", data.conversationId)
      .is("assigned_user_id", null)
      .select()
      .single();

    if (error || !updated) {
      throw new Error("Conversa já assumida ou não encontrada");
    }
    return updated;
  });

export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        content: z.string().trim().min(1).max(4096),
        type: z.string().max(50).default("text"),
        mediaUrl: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertWhatsAppStaff(context);

    const { data: conversation, error: conversationError } = await context.supabase
      .from("whatsapp_conversations")
      .select("id,status,assigned_user_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation || conversation.status !== "in_service") {
      throw new Error("Assuma o atendimento antes de enviar mensagens");
    }
    if (conversation.assigned_user_id && conversation.assigned_user_id !== context.userId) {
      throw new Error("Esta conversa está atribuída a outro atendente");
    }

    const { data: message, error } = await context.supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: data.conversationId,
        direction: "outbound",
        content: data.content,
        type: data.type,
        media_url: data.mediaUrl,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;

    // A fila registra a mensagem como pending. Um adapter externo deve trocar
    // o status para sent/delivered após confirmação real do provedor.
    return message;
  });

export const finishConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ConversationSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertWhatsAppStaff(context);

    const { data: conversation, error: readError } = await context.supabase
      .from("whatsapp_conversations")
      .select("id,assigned_user_id")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (readError) throw readError;
    if (!conversation) throw new Error("Conversa não encontrada");
    if (conversation.assigned_user_id && conversation.assigned_user_id !== context.userId) {
      throw new Error("Esta conversa está atribuída a outro atendente");
    }

    const { error } = await context.supabase
      .from("whatsapp_conversations")
      .update({
        status: "finished",
        finished_at: new Date().toISOString(),
      })
      .eq("id", data.conversationId);
    if (error) throw error;
    return { success: true };
  });

export const addInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        content: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertWhatsAppStaff(context);

    const { data: note, error } = await context.supabase
      .from("whatsapp_internal_notes")
      .insert({
        conversation_id: data.conversationId,
        user_id: context.userId,
        content: data.content,
      })
      .select()
      .single();
    if (error) throw error;
    return note;
  });
