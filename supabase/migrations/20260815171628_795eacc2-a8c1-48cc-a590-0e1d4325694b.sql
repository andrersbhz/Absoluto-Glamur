-- 1. Additional Policies for whatsapp_contacts
CREATE POLICY "Support manage contacts" ON public.whatsapp_contacts
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

-- 2. Additional Policies for whatsapp_conversations
CREATE POLICY "Support manage conversations" ON public.whatsapp_conversations
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

-- 3. Additional Policies for whatsapp_internal_notes
CREATE POLICY "Support manage notes" ON public.whatsapp_internal_notes
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

-- 4. Additional Policies for whatsapp_conversation_tags
CREATE POLICY "Support manage conversation tags" ON public.whatsapp_conversation_tags
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

-- 5. Additional Policies for whatsapp_messages
CREATE POLICY "Support manage messages" ON public.whatsapp_messages
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));

-- 6. Additional Policies for whatsapp_tags
CREATE POLICY "Support manage tags" ON public.whatsapp_tags
    FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin') OR public.has_role(auth.uid(), 'support'));
