DROP POLICY IF EXISTS "Support view contacts" ON public.whatsapp_contacts;
DROP POLICY IF EXISTS "Support manage contacts" ON public.whatsapp_contacts;
CREATE POLICY "whatsapp_contacts_policy" ON public.whatsapp_contacts
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

DROP POLICY IF EXISTS "Support view conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Support manage conversations" ON public.whatsapp_conversations;
CREATE POLICY "whatsapp_conversations_policy" ON public.whatsapp_conversations
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

DROP POLICY IF EXISTS "Support view messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Support manage messages" ON public.whatsapp_messages;
CREATE POLICY "whatsapp_messages_policy" ON public.whatsapp_messages
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

DROP POLICY IF EXISTS "Support view notes" ON public.whatsapp_internal_notes;
DROP POLICY IF EXISTS "Support manage notes" ON public.whatsapp_internal_notes;
CREATE POLICY "whatsapp_internal_notes_policy" ON public.whatsapp_internal_notes
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

DROP POLICY IF EXISTS "Public view tags" ON public.whatsapp_tags;
DROP POLICY IF EXISTS "Support manage tags" ON public.whatsapp_tags;
CREATE POLICY "whatsapp_tags_policy" ON public.whatsapp_tags
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

DROP POLICY IF EXISTS "Support manage conversation tags" ON public.whatsapp_conversation_tags;
CREATE POLICY "whatsapp_conversation_tags_policy" ON public.whatsapp_conversation_tags
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));
