import { createFileRoute } from "@tanstack/react-router";
import { StoreLayout } from "@/components/store/StoreLayout";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/compliance/terms")({
  head: () => ({
    meta: [
      { title: "Termos de Uso · Absoluto Glamur" },
      { name: "description", content: "Condições gerais de uso do site Absoluto Glamur." },
    ],
  }),
  component: TermsOfUse,
});

function TermsOfUse() {
  return (
    <StoreLayout>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl text-foreground">Termos de Uso</h1>
        </div>
        
        <div className="prose prose-plum max-w-none text-muted-foreground leading-relaxed">
          <p className="text-sm italic mb-8">Última atualização: 15 de agosto de 2026</p>
          
          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">1. Aceitação dos Termos</h2>
            <p>
              Ao acessar o site <strong>Absoluto Glamur</strong>, você concorda em cumprir estes termos de serviço, todas as leis e regulamentos aplicáveis e concorda que é responsável pelo cumprimento de todas as leis locais aplicáveis.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">2. Uso de Licença</h2>
            <p>
              É concedida permissão para baixar temporariamente uma cópia dos materiais (informações ou software) no site Absoluto Glamur, apenas para visualização pessoal e não comercial transitória.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">3. Isenção de Responsabilidade</h2>
            <p>
              Os materiais no site da Absoluto Glamur são fornecidos "como estão". A Absoluto Glamur não oferece garantias, expressas ou implícitas, e, por este meio, isenta e nega todas as outras garantias, incluindo, sem limitação, garantias implícitas ou condições de comercialização, adequação a um fim específico ou não violação de propriedade intelectual ou outra violação de direitos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">4. Limitações</h2>
            <p>
              Em nenhum caso a Absoluto Glamur ou seus fornecedores serão responsáveis por quaisquer danos decorrentes do uso ou da incapacidade de usar os materiais em nosso site.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">5. Precisão dos Materiais</h2>
            <p>
              Os materiais exibidos no site da Absoluto Glamur podem incluir erros técnicos, tipográficos ou fotográficos. A Absoluto Glamur não garante que qualquer material em seu site seja preciso, completo ou atual.
            </p>
          </section>
        </div>
      </div>
    </StoreLayout>
  );
}
