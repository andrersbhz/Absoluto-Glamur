import { createFileRoute } from "@tanstack/react-router";
import { StoreLayout } from "@/components/store/StoreLayout";
import { Megaphone } from "lucide-react";

export const Route = createFileRoute("/compliance/ads")({
  head: () => ({
    meta: [
      { title: "Política de Publicidade · Absoluto Glamur" },
      { name: "description", content: "Nossas diretrizes para anúncios e parcerias em conformidade com as normas de publicidade digital." },
    ],
  }),
  component: AdsPolicy,
});

function AdsPolicy() {
  return (
    <StoreLayout>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 mb-8">
          <Megaphone className="h-8 w-8 text-primary" />
          <h1 className="font-display text-4xl text-foreground">Política de Publicidade</h1>
        </div>
        
        <div className="prose prose-plum max-w-none text-muted-foreground leading-relaxed">
          <p className="text-sm italic mb-8">Última atualização: 15 de agosto de 2026</p>
          
          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">1. Transparência</h2>
            <p>
              A <strong>Absoluto Glamur</strong> compromete-se com a transparência em todas as suas comunicações de marketing. Todo conteúdo publicitário, seja em nosso site, redes sociais ou e-mails, é claramente identificado.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">2. Publicidade Direcionada</h2>
            <p>
              Utilizamos tecnologias de rastreamento para exibir anúncios que acreditamos ser de seu interesse. Respeitamos as políticas de publicidade das plataformas parceiras (Meta Ads, Google Ads, TikTok Ads) e as regulamentações do CONAR no Brasil.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">3. Remarketing</h2>
            <p>
              Se você visitar nosso site, poderá ver anúncios de nossos produtos em outros sites ou redes sociais. Isso é feito através de cookies de terceiros. Você pode optar por sair dessas redes de publicidade direcionada através das configurações de anúncios do Google ou da Digital Advertising Alliance.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">4. Conteúdo Gerado por Usuários</h2>
            <p>
              Avaliações e comentários são opiniões de clientes. Não pagamos por avaliações positivas, garantindo a autenticidade da experiência de compra compartilhada em nossa plataforma.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-display text-foreground mb-4">5. Conformidade Legal</h2>
            <p>
              Nossa publicidade não contém informações enganosas, ofensivas ou que violem os direitos de terceiros. Seguimos rigorosamente as normas de defesa do consumidor.
            </p>
          </section>
        </div>
      </div>
    </StoreLayout>
  );
}
