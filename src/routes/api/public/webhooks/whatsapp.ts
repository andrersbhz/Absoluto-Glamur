import { createFileRoute } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute('/api/public/webhooks/whatsapp')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          console.log("WhatsApp Webhook Received:", body);

          // 1. Identify phone and contact
          const phone = body.phone; // Map based on API provider (Evolution API, Z-API, etc)
          const name = body.name || "Cliente WhatsApp";
          const messageContent = body.message?.text || "";
          const whatsappMsgId = body.message?.id;

          if (!phone) return new Response("Missing phone", { status: 400 });

          // 2. Find or create contact
          let { data: contact } = await supabase
            .from("whatsapp_contacts")
            .select("id")
            .eq("phone", phone)
            .single();

          if (!contact) {
            const { data: newContact, error: contactError } = await supabase
              .from("whatsapp_contacts")
              .insert({ phone, name })
              .select("id")
              .single();
            if (contactError) throw contactError;
            contact = newContact;
          }

          // 3. Find active conversation or create new one
          let conversation: { id: string; status?: string } | null = null;
          
          const { data: existingConv } = await supabase
            .from("whatsapp_conversations")
            .select("id, status")
            .eq("contact_id", contact.id)
            .in("status", ["waiting", "in_service"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          conversation = existingConv;

          if (!conversation) {
            const { data: newConv, error: convError } = await supabase
              .from("whatsapp_conversations")
              .insert({
                contact_id: contact.id,
                status: "waiting"
              })
              .select("id, status")
              .single();
            if (convError) throw convError;
            conversation = newConv;
          }

          // 4. Record message (with idempotency)
          const { error: msgError } = await supabase
            .from("whatsapp_messages")
            .insert({
              conversation_id: conversation.id,
              direction: "inbound",
              content: messageContent,
              whatsapp_message_id: whatsappMsgId,
              status: "delivered"
            });

          // Update last_message_at
          await supabase
            .from("whatsapp_conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversation.id);

          return new Response("OK", { status: 200 });
        } catch (error) {
          console.error("WhatsApp Webhook Error:", error);
          return new Response("Internal Error", { status: 500 });
        }
      }
    }
  }
});
