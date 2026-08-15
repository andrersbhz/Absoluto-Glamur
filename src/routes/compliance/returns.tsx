import { createFileRoute } from "@tanstack/react-router";
import { StoreLayout } from "@/components/store/StoreLayout";
import { RefreshCcw } from "lucide-react";

export const Route = createFileRoute("/compliance/returns")({
  head: () => ({
    meta: [
      { title: "Trocas e Devoluções · Absoluto Glamur" },
      { name: "description", content: "Informações sobre prazos e procedimentos para trocas e devoluções na Absoluto Glamur." },
    ],
  }),
  component: ReturnsPolicy,
});

function ReturnsPolicy() {
  return (
    <StoreLayout>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <RefreshCcw className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl text-foreground">Trocas e Devoluções</h1>
        </div>
        
        <div className="prose prose-plum max-w-none text-muted-foreground leading-relaxed">
          <p className="text-sm italic mb-8">Última atualização: 15 de agosto de 2026</p>
          
          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">1. Direito de Arrependimento</h2>
            <p>
              Conforme o Código de Defesa do Consumidor, você tem o direito de desistir da compra em até <strong>7 dias corridos</strong> após o recebimento do produto, sem necessidade de justificativa, desde que o produto não tenha sido utilizado ou violado.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">2. Condições para Devolução</h2>
            <p>Para que a devolução seja aceita, o produto deve:</p>
            <ul>
              <li>Estar em sua embalagem original.</li>
              <li>Não apresentar sinais de uso ou abertura de lacres (especialmente para cosméticos e skincare por questões de higiene).</li>
              <li>Estar acompanhado de todos os acessórios e manuais.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">3. Produtos com Defeito</h2>
            <p>
              Caso receba um produto com defeito de fabricação, entre em contato conosco imediatamente. O prazo para reclamação é de até 30 dias após o recebimento. Faremos a análise e, se constatado o defeito, providenciaremos a troca ou o reembolso.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">4. Processo de Reembolso</h2>
            <p>
              O reembolso será processado através do mesmo método de pagamento utilizado na compra:
            </p>
            <ul>
              <li><strong>Cartão de Crédito:</strong> O estorno poderá aparecer em até duas faturas subsequentes.</li>
              <li><strong>PIX:</strong> O valor será devolvido para a conta de origem em até 5 dias úteis.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">5. Como solicitar</h2>
            <p>
              Para iniciar um processo de troca ou devolução, entre em contato com nosso suporte através do e-mail ou WhatsApp disponível em nossa página de Contato.
            </p>
          </section>
        </div>
      </div>
    </StoreLayout>
  );
}
