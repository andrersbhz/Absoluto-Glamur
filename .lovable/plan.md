# Plano de Implementação: Central de Atendimento WhatsApp (Absoluto Glamur)

Adicionar um módulo completo de atendimento omnichannel via WhatsApp ao sistema administrativo, integrando banco de dados, realtime, alertas sonoros e interface profissional.

## 1. Infraestrutura de Banco de Dados
- **Tabelas**: Criar `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages`, `whatsapp_internal_notes`, `whatsapp_tags`.
- **Segurança**: Habilitar RLS e permissões para roles `admin`, `superadmin` e `support`.
- **Realtime**: Habilitar replicação Supabase para as tabelas de conversas e mensagens para garantir atualização sem F5.

## 2. Backend e Integração (Server Functions)
- **WhatsApp Provider**: Criar `src/lib/whatsapp.server.ts` e `src/lib/whatsapp.functions.ts` para abstrair a comunicação com a API (enviar mensagens/mídias).
- **Gerenciamento de Atendimento**: Implementar funções para assumir atendimento (`claimConversation`), transferir (`transferConversation`) e finalizar (`finishConversation`).
- **Webhook**: Criar endpoint seguro em `src/routes/api/public/webhooks/whatsapp.ts` para receber mensagens, identificar clientes, atualizar a fila e disparar eventos realtime.

## 3. Interface Administrativa (Admin UI)
- **Menu**: Adicionar item "Atendimento" ao `AdminLayout`.
- **Interface Principal (`admin.whatsapp.tsx`)**: 
  - Coluna de Fila (Aguardando, Em atendimento, Finalizados).
  - Lista de Conversas com indicadores de tempo de espera e última mensagem.
  - Chat central inspirado no WhatsApp com suporte a mídias e notas internas.
  - Painel lateral com perfil do cliente, histórico e pedidos relacionados.
- **Responsividade**: Layout adaptável para desktop, tablet e mobile.

## 4. Alertas e Notificações
- **Alerta Sonoro**: Implementar sistema de áudio recorrente (30s) para conversas em `waiting`, respeitando interações do usuário.
- **Indicadores Visuais**: Contadores dinâmicos no menu e badges de status na fila.
- **Push Notifications**: Integração com o sistema de Web Push já existente para novos atendimentos.

## 5. Testes e Validação
- Validar concorrência (impedir dois atendentes na mesma conversa).
- Testar fluxo completo: mensagem cliente -> fila -> alerta -> atender -> responder -> finalizar.

## Detalhes Técnicos
- **Realtime**: Uso de `supabase.channel` para ouvir mudanças em `whatsapp_conversations` e `whatsapp_messages`.
- **Estado**: Gerenciamento de estado via TanStack Query para cache e sincronia de dados.
- **Design**: Componentes `shadcn/ui` customizados com o tema "Maison de Beleza" (neon rosa/verde limão).
