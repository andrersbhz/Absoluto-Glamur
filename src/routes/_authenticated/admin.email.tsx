import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Mail, PlugZap, Save, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import {
  disconnectEmailProvider,
  getEmailProviderConfig,
  saveEmailProviderConfig,
  testEmailProvider,
} from "@/lib/email-provider.functions";

export const Route = createFileRoute("/_authenticated/admin/email")({
  head: () => ({ meta: [{ title: "E-mail do sistema · Admin Absoluto Glamur" }] }),
  component: EmailProviderPage,
});

type Security = "ssl_tls" | "starttls" | "none";
type Preset = "hostinger" | "custom";

function EmailProviderPage() {
  const qc = useQueryClient();
  const getConfig = useServerFn(getEmailProviderConfig);
  const saveConfig = useServerFn(saveEmailProviderConfig);
  const testConfig = useServerFn(testEmailProvider);
  const disconnect = useServerFn(disconnectEmailProvider);

  const q = useQuery({
    queryKey: ["email-provider"],
    queryFn: () => getConfig(),
  });

  const [preset, setPreset] = useState<Preset>("hostinger");
  const [enabled, setEnabled] = useState(false);
  const [host, setHost] = useState("smtp.hostinger.com");
  const [port, setPort] = useState(465);
  const [security, setSecurity] = useState<Security>("ssl_tls");
  const [username, setUsername] = useState("contato@absolutoglamur.com.br");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fromEmail, setFromEmail] = useState("contato@absolutoglamur.com.br");
  const [fromName, setFromName] = useState("Absoluto Glamur");
  const [replyTo, setReplyTo] = useState("contato@absolutoglamur.com.br");
  const [testRecipient, setTestRecipient] = useState("contato@absolutoglamur.com.br");

  useEffect(() => {
    if (!q.data) return;
    setPreset(q.data.preset);
    setEnabled(q.data.enabled);
    setHost(q.data.host);
    setPort(q.data.port);
    setSecurity(q.data.security);
    setUsername(q.data.username);
    setFromEmail(q.data.from_email);
    setFromName(q.data.from_name);
    setReplyTo(q.data.reply_to ?? "");
    setTestRecipient((current) => current || q.data.from_email);
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveConfig({
        data: {
          preset,
          enabled,
          host: host.trim(),
          port,
          security,
          username: username.trim(),
          password: password.trim() || undefined,
          from_email: fromEmail.trim(),
          from_name: fromName.trim(),
          reply_to: replyTo.trim() || null,
        },
      }),
    onSuccess: async () => {
      setPassword("");
      toast.success("Configuração de e-mail salva.");
      await qc.invalidateQueries({ queryKey: ["email-provider"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMut = useMutation({
    mutationFn: () => testConfig({ data: { recipient: testRecipient.trim() } }),
    onSuccess: async ({ recipient }) => {
      toast.success(`E-mail de teste enviado para ${recipient}.`);
      await qc.invalidateQueries({ queryKey: ["email-provider"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => disconnect(),
    onSuccess: async () => {
      setPassword("");
      setEnabled(false);
      toast.success("Provedor de e-mail desconectado.");
      await qc.invalidateQueries({ queryKey: ["email-provider"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function applyPreset(value: Preset) {
    setPreset(value);
    if (value === "hostinger") {
      setHost("smtp.hostinger.com");
      setPort(465);
      setSecurity("ssl_tls");
      if (!username) setUsername("contato@absolutoglamur.com.br");
      if (!fromEmail) setFromEmail("contato@absolutoglamur.com.br");
      if (!replyTo) setReplyTo("contato@absolutoglamur.com.br");
    }
  }

  const status = q.data?.last_status;

  return (
    <AdminLayout>
      <div className="mx-auto w-full max-w-5xl overflow-y-auto pb-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" />
              <h1 className="font-display text-3xl">E-mail do sistema</h1>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Configure o SMTP usado pelos e-mails transacionais da loja. O endereço remetente e o provedor podem ser trocados depois sem alterar o código.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {status === "ok" ? (
              <Badge className="bg-success text-white">SMTP validado</Badge>
            ) : status === "error" ? (
              <Badge variant="destructive">Erro no SMTP</Badge>
            ) : (
              <Badge variant="outline">Não testado</Badge>
            )}
            {q.data?.enabled ? <Badge>Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
          </div>
        </div>

        {q.isLoading ? (
          <p className="mt-8 text-sm text-muted-foreground">Carregando configuração…</p>
        ) : q.error ? (
          <div className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {(q.error as Error).message}
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl">Provedor e conexão SMTP</h2>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Provedor">
                  <select
                    value={preset}
                    onChange={(event) => applyPreset(event.target.value as Preset)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="hostinger">Hostinger Email</option>
                    <option value="custom">SMTP personalizado</option>
                  </select>
                </Field>

                <label className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                    className="h-4 w-4"
                  />
                  <span>
                    <span className="block font-medium">Ativar envio pelo sistema</span>
                    <span className="block text-xs text-muted-foreground">Só ative após salvar e testar a conexão.</span>
                  </span>
                </label>

                <Field label="Servidor SMTP">
                  <input
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    placeholder="smtp.hostinger.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm"
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Porta">
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      value={port}
                      onChange={(event) => setPort(Number(event.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Segurança">
                    <select
                      value={security}
                      onChange={(event) => setSecurity(event.target.value as Security)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="ssl_tls">SSL/TLS</option>
                      <option value="starttls">STARTTLS</option>
                      <option value="none">Sem criptografia</option>
                    </select>
                  </Field>
                </div>

                <Field label="Usuário SMTP">
                  <input
                    type="email"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="contato@absolutoglamur.com.br"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>

                <Field label={`Senha SMTP${q.data?.password_configured ? " (já configurada; deixe em branco para manter)" : ""}`}>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={q.data?.password_configured ? q.data.password_masked ?? "senha já salva" : "senha da conta de e-mail"}
                      autoComplete="new-password"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 pr-10 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">A senha é salva como segredo no servidor e não é devolvida ao navegador.</p>
                </Field>
              </div>

              {security === "none" && (
                <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  O sistema não permite ativar SMTP sem criptografia. Use SSL/TLS ou STARTTLS.
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="font-display text-xl">Remetente</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Estes dados aparecem para o cliente. Você poderá trocar o endereço futuramente sem alteração de código.
              </p>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="E-mail remetente">
                  <input
                    type="email"
                    value={fromEmail}
                    onChange={(event) => setFromEmail(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Nome do remetente">
                  <input
                    value={fromName}
                    onChange={(event) => setFromName(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Responder para (Reply-To)">
                  <input
                    type="email"
                    value={replyTo}
                    onChange={(event) => setReplyTo(event.target.value)}
                    placeholder={fromEmail}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="Enviar teste para">
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(event) => setTestRecipient(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </Field>
              </div>
            </section>

            {q.data?.last_error && (
              <section className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
                <p className="text-xs font-medium uppercase tracking-widest text-destructive">Último erro</p>
                <p className="mt-2 break-words font-mono text-xs text-destructive">{q.data.last_error}</p>
              </section>
            )}

            <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm">
              <p className="font-medium">Recuperação de senha</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                A tela “Esqueci minha senha” usa o Supabase Auth. Este painel configura o SMTP do sistema e permite validar as credenciais. Para que os e-mails de recuperação também saiam por este endereço, use os mesmos dados SMTP na configuração de SMTP do Supabase Auth.
              </p>
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              {(q.data?.password_configured || q.data?.enabled) && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Desconectar o provedor de e-mail e remover a senha SMTP salva?")) {
                      disconnectMut.mutate();
                    }
                  }}
                  disabled={disconnectMut.isPending}
                  className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  <PlugZap className="h-4 w-4" /> Desconectar
                </button>
              )}
              <button
                type="button"
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saveMut.isPending ? "Salvando…" : "Salvar configuração"}
              </button>
              <button
                type="button"
                onClick={() => testMut.mutate()}
                disabled={testMut.isPending || !q.data?.password_configured || !testRecipient.trim()}
                title={!q.data?.password_configured ? "Salve a configuração e a senha antes de testar" : "Enviar e-mail real de teste"}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground shadow-soft hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" /> {testMut.isPending ? "Enviando teste…" : "Enviar e-mail de teste"}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
