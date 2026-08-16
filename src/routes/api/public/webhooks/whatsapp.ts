import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const WhatsAppWebhookSchema = z.object({
  phone: z.string().min(8).max(30),
  name: z.string().max(200).optional(),
  message: z
    .object({
      id: z.string().max(300).optional(),
      text: z.string().max(10000).optional(),
    })
    .optional(),
});

export const Route = createFileRoute("/api/public/webhooks/whatsapp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const expected = process.env.WHATSAPP_WEBHOOK_TOKEN;
          const provided =
            request.headers.get("x-webhook-token") ??
            request.headers.get("x-whatsapp-token") ??
            request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
            "";
          if (!expected || provided !== expected) {
            return new Response("Unauthorized", { status: 401 });
          }

          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > 64 * 1024) {
            return new Response("Payload too large", { status: 413 });
          }

          const body = WhatsAppWebhookSchema.parse(await request.json());
          const phone = body.phone.replace(/\D/g, "");
          if (phone.length < 8 || phone.length > 15) {
            return new Response("Invalid phone", { status: 400 });
          }
          const name = body.name?.trim() || "Cliente WhatsApp";
          const messageContent = body.message?.text?.trim() || "";
          const whatsappMsgId = body.message?.id ?? null;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          if (whatsappMsgId) {
            const { data: duplicate } = await supabaseAdmin
              .from("whatsapp_messages")
              .select("id")
              .eq("whatsapp_message_id", whatsappMsgId)
              .limit(1)
              .maybeSingle();
            if (duplicate) return new Response("OK", { status: 200 });
          }

          let { data: contact, error: contactReadError } = await supabaseAdmin
            .from("whatsapp_contacts")
            .select("id")
            .eq("phone", phone)
            .maybeSingle();
          if (contactReadError) throw contactReadError;

          if (!contact) {
            const { data: newContact, error: contactError } = await supabaseAdmin
              .from("whatsapp_contacts")
              .insert({ phone, name })
              .select("id")
              .single();
            if (contactError) throw contactError;
            contact = newContact;
          }

          const { data: existingConv, error: convReadError } = await supabaseAdmin
            .from("whatsapp_conversations")
            .select("id,status")
            .eq("contact_id", contact.id)
            .in("status", ["waiting", "in_service"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (convReadError) throw convReadError;

          let conversation = existingConv;
          if (!conversation) {
            const { data: newConv, error: convError } = await supabaseAdmin
              .from("whatsapp_conversations")
              .insert({ contact_id: contact.id, status: "waiting" })
              .select("id,status")
              .single();
            if (convError) throw convError;
            conversation = newConv;
          }

          const { error: msgError } = await supabaseAdmin.from("whatsapp_messages").insert({
            conversation_id: conversation.id,
            direction: "inbound",
            content: messageContent,
            whatsapp_message_id: whatsappMsgId,
            status: "delivered",
          });
          if (msgError) throw msgError;

          const { error: updateError } = await supabaseAdmin
            .from("whatsapp_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversation.id);
          if (updateError) throw updateError;

          return new Response("OK", { status: 200 });
        } catch (error) {
          console.error("WhatsApp Webhook Error:", error);
          return new Response(error instanceof z.ZodError ? "Invalid payload" : "Internal Error", {
            status: error instanceof z.ZodError ? 400 : 500,
          });
        }
      },
    },
  },
});
