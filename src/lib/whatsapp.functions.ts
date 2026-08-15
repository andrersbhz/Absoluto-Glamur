import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/**
 * WhatsApp Message Interface
 */
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

/**
 * WhatsApp Conversation Interface
 */
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

/**
 * Claim a conversation (assign to current user)
 */
export const claimConversation = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ conversationId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Unauthorized");

    // Atomic update to prevent race conditions
    const { data: updated, error } = await supabase
      .from("whatsapp_conversations")
      .update({
        assigned_user_id: userData.user.id,
        status: "in_service",
        assigned_at: new Date().toISOString(),
        started_at: new Date().toISOString()
      })
      .eq("id", data.conversationId)
      .is("assigned_user_id", null) // Only if not assigned
      .select()
      .single();

    if (error || !updated) {
      throw new Error("Conversation already claimed or not found");
    }

    return updated;
  });

/**
 * Send a WhatsApp message
 */
export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    conversationId: z.string(),
    content: z.string(),
    type: z.string().default("text"),
    mediaUrl: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Unauthorized");

    // 1. Log outgoing message in DB
    const { data: message, error } = await supabase
      .from("whatsapp_messages")
      .insert({
        conversation_id: data.conversationId,
        direction: "outbound",
        content: data.content,
        type: data.type,
        media_url: data.mediaUrl,
        status: "sent"
      })
      .select()
      .single();

    if (error) throw error;

    // 2. Integration with External API (Logic to be implemented in integrations panel)
    // For now, we simulate the outbound success
    console.log("Simulating WhatsApp API send:", data.content);

    return message;
  });

/**
 * Finish a conversation
 */
export const finishConversation = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ conversationId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { error } = await supabase
      .from("whatsapp_conversations")
      .update({
        status: "finished",
        finished_at: new Date().toISOString()
      })
      .eq("id", data.conversationId);

    if (error) throw error;
    return { success: true };
  });

/**
 * Add internal note
 */
export const addInternalNote = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    conversationId: z.string(),
    content: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error("Unauthorized");

    const { data: note, error } = await supabase
      .from("whatsapp_internal_notes")
      .insert({
        conversation_id: data.conversationId,
        user_id: userData.user.id,
        content: data.content
      })
      .select()
      .single();

    if (error) throw error;
    return note;
  });
