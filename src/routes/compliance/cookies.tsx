import { createFileRoute } from "@tanstack/react-router";
import { StoreLayout } from "@/components/store/StoreLayout";
import { Cookie } from "lucide-react";

export const Route = createFileRoute("/compliance/cookies")({
  head: () => ({
    meta: [
      { title: "Política de Cookies · Absoluto Glamur" },
      { name: "description", content: "Entenda como utilizamos cookies para melhorar sua experiência na Absoluto Glamur." },
    ],
  }),
  component: CookiesPolicy,
});

function CookiesPolicy() {
  return (
    <StoreLayout>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <Cookie className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl text-foreground">Política de Cookies</h1>
        </div>
        
        <div className="prose prose-plum max-w-none text-muted-foreground leading-relaxed">
          <p className="text-sm italic mb-8">Última atualização: 15 de agosto de 2026</p>
          
          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">O que são Cookies?</h2>
            <p>
              Cookies são pequenos arquivos de texto baixados no seu computador ou dispositivo móvel quando você visita um site. Eles são amplamente utilizados para fazer os sites funcionarem ou funcionarem de forma mais eficiente, bem como para fornecer informações aos proprietários do site.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">Como usamos os Cookies?</h2>
            <p>Utilizamos cookies para:</p>
            <ul>
              <li><strong>Funcionalidade:</strong> Manter você conectado e lembrar suas preferências de carrinho e conta.</li>
              <li><strong>Desempenho:</strong> Entender como os visitantes interagem com o site, identificando áreas de melhoria.</li>
              <li><strong>Publicidade:</strong> Mostrar anúncios relevantes aos seus interesses em plataformas externas (como Google e Facebook).</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">Cookies de Terceiros</h2>
            <p>
              Além dos nossos próprios cookies, também podemos usar vários cookies de terceiros para relatar estatísticas de uso do site, entregar anúncios no site e assim por diante. Isso inclui Google Analytics, Facebook Pixel e ferramentas de publicidade do AliExpress.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">Gerenciando Cookies</h2>
            <p>
              Você pode controlar e/ou excluir cookies conforme desejar através das configurações do seu navegador. No entanto, se você desativar os cookies, algumas partes do nosso site podem não funcionar corretamente.
            </p>
          </section>
        </div>
      </div>
    </StoreLayout>
  );
}
