import { createFileRoute } from "@tanstack/react-router";
import { StoreLayout } from "@/components/store/StoreLayout";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/compliance/privacy")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade · Absoluto Glamur" },
      { name: "description", content: "Saiba como protegemos seus dados pessoais na Absoluto Glamur conforme a LGPD." },
      { name: "robots", content: "index, follow" }
    ],
  }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return (
    <StoreLayout>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <Shield className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl text-foreground">Política de Privacidade</h1>
        </div>
        
        <div className="prose prose-plum max-w-none text-muted-foreground leading-relaxed">
          <p className="text-sm italic mb-8">Última atualização: 15 de agosto de 2026</p>
          
          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">1. Introdução</h2>
            <p>
              A <strong>Absoluto Glamur</strong> valoriza a privacidade de seus clientes. Esta política detalha como coletamos, usamos e protegemos suas informações pessoais em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">2. Dados Coletados</h2>
            <p>Coletamos dados necessários para a prestação de nossos serviços, incluindo:</p>
            <ul>
              <li>Dados cadastrais: nome, CPF, e-mail, telefone e endereço de entrega.</li>
              <li>Dados de navegação: endereço IP, cookies e comportamento no site (via ferramentas de análise).</li>
              <li>Dados de pagamento: processados de forma segura via gateways parceiros (Asaas, PagBank, NuPay), sem armazenamento de números de cartão em nossos servidores.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">3. Finalidade do Uso</h2>
            <p>Seus dados são utilizados para:</p>
            <ul>
              <li>Processamento e entrega de pedidos.</li>
              <li>Comunicação sobre status de compras e suporte ao cliente.</li>
              <li>Personalização da experiência de compra.</li>
              <li>Envio de ofertas e novidades (quando autorizado).</li>
              <li>Cumprimento de obrigações legais e prevenção a fraudes.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">4. Seus Direitos</h2>
            <p>
              Você possui direito de acesso, correção, anonimização ou exclusão de seus dados a qualquer momento, conforme previsto na LGPD. Para exercer esses direitos, entre em contato através de nossa Central de Ajuda.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">5. Segurança</h2>
            <p>
              Implementamos medidas técnicas e organizacionais para proteger seus dados contra acessos não autorizados e situações acidentais ou ilícitas de destruição, perda ou alteração.
            </p>
          </section>
        </div>
      </div>
    </StoreLayout>
  );
}
