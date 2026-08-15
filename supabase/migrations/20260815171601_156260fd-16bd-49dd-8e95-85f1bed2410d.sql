-- 1. Create WhatsApp Tables
CREATE TABLE IF NOT EXISTS public.whatsapp_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    phone TEXT UNIQUE NOT NULL,
    whatsapp_id TEXT UNIQUE,
    profile_picture TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    CREATE TYPE public.whatsapp_conversation_status AS ENUM ('waiting', 'in_service', 'finished', 'transferred');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID REFERENCES public.whatsapp_contacts(id) ON DELETE CASCADE NOT NULL,
    assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    status public.whatsapp_conversation_status DEFAULT 'waiting' NOT NULL,
    priority INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    assigned_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
    CREATE TYPE public.whatsapp_message_direction AS ENUM ('inbound', 'outbound');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.whatsapp_message_status AS ENUM ('sent', 'delivered', 'read', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE NOT NULL,
    whatsapp_message_id TEXT UNIQUE,
    direction public.whatsapp_message_direction NOT NULL,
    type TEXT DEFAULT 'text',
    content TEXT,
    media_url TEXT,
    status public.whatsapp_message_status DEFAULT 'sent',
    sent_at TIMESTAMPTZ DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_internal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    color TEXT DEFAULT '#3B82F6',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_conversation_tags (
    conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE NOT NULL,
    tag_id UUID REFERENCES public.whatsapp_tags(id) ON DELETE CASCADE NOT NULL,
    PRIMARY KEY (conversation_id, tag_id)
);

-- 2. Security (RLS)
ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_conversation_tags ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_conversations TO authenticated;
GRANT SELECT, INSERT ON public.whatsapp_messages TO authenticated;
GRANT SELECT, INSERT ON public.whatsapp_internal_notes TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.whatsapp_tags TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.whatsapp_conversation_tags TO authenticated;

GRANT ALL ON public.whatsapp_contacts TO service_role;
GRANT ALL ON public.whatsapp_conversations TO service_role;
GRANT ALL ON public.whatsapp_messages TO service_role;
GRANT ALL ON public.whatsapp_internal_notes TO service_role;
GRANT ALL ON public.whatsapp_tags TO service_role;
GRANT ALL ON public.whatsapp_conversation_tags TO service_role;

-- Policies
CREATE POLICY "Support view contacts" ON public.whatsapp_contacts
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

CREATE POLICY "Support view conversations" ON public.whatsapp_conversations
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

CREATE POLICY "Support view messages" ON public.whatsapp_messages
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

CREATE POLICY "Support view notes" ON public.whatsapp_internal_notes
    FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

CREATE POLICY "Public view tags" ON public.whatsapp_tags
    FOR SELECT TO authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_status ON public.whatsapp_conversations(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned_user ON public.whatsapp_conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation ON public.whatsapp_messages(conversation_id);

-- 3. Enable Realtime (This might need service_role or be handled by the system)
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_contacts;
