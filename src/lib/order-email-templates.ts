import { ORDER_LABELS, trackingUrl } from "./order-lifecycle";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export type OrderEmailInput = {
  code: string;
  name: string;
  status: string;
  totalCents: number;
  orderUrl: string;
  whatsappUrl: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
};
const COPY: Record<string, { title: string; body: string; next: string }> = {
  awaiting_payment: {
    title: "Seu pedido chegou por aqui",
    body: "Obrigada por escolher a Absoluto Glamur! Seu pedido foi recebido e estamos aguardando a confirmação do pagamento.",
    next: "Se você já pagou, não precisa pagar novamente. A confirmação aparecerá na sua conta assim que for concluída.",
  },
  validating: {
    title: "Estamos conferindo seu pagamento",
    body: "Recebemos o seu aviso de pagamento e nossa equipe está fazendo a conferência com carinho e atenção.",
    next: "Por enquanto, não faça um novo pagamento. Assim que confirmarmos o recebimento, vamos avisar você.",
  },
  paid: {
    title: "Pagamento confirmado. Está tudo certo!",
    body: "Seu pagamento foi confirmado e seu pedido já pode seguir para a preparação. Muito obrigada pela confiança!",
    next: "Avisaremos você quando começarmos a separar seus produtos.",
  },
  processing: {
    title: "Estamos preparando seu pedido",
    body: "Seus produtos estão em separação. Estamos cuidando de cada detalhe para que tudo siga certinho até você.",
    next: "Assim que o pedido for despachado, enviaremos o código de rastreio para você acompanhar.",
  },
  shipped: {
    title: "Seu pedido está a caminho",
    body: "Seu pedido foi despachado! Agora você pode acompanhar as atualizações do transporte pelo código de rastreio abaixo.",
    next: "A primeira movimentação pode levar um tempo para aparecer. Seguimos à disposição para acompanhar com você.",
  },
  delivered: {
    title: "Seu pedido foi entregue",
    body: "A transportadora confirmou a entrega do seu pedido. Esperamos que você aproveite muito suas escolhas!",
    next: "Se você ainda não recebeu o pacote ou precisar de ajuda com algum produto, fale com a gente para verificarmos.",
  },
  cancelled: {
    title: "Atualização sobre o seu pedido",
    body: "Seu pedido foi cancelado. Sabemos que essa notícia pode gerar dúvidas e estamos aqui para ajudar.",
    next: "Se você já realizou o pagamento, fale com nossa equipe para conferirmos o recebimento e orientarmos os próximos passos.",
  },
  refunded: {
    title: "Reembolso confirmado",
    body: "Recebemos a confirmação do reembolso do seu pedido.",
    next: "O prazo para o valor aparecer depende do meio de pagamento e da instituição financeira. Se precisar, ajudamos você a acompanhar.",
  },
  failed: {
    title: "Precisamos de um cuidado com o pagamento",
    body: "Não conseguimos concluir o pagamento do seu pedido neste momento.",
    next: "Se houve débito na sua conta, não tente pagar novamente antes de falar com a gente. Vamos conferir juntos.",
  },
};
export function buildOrderEmail(input: OrderEmailInput) {
  const copy = COPY[input.status];
  if (!copy) throw new Error(`Etapa sem modelo de e-mail: ${input.status}`);
  const total = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    input.totalCents / 100,
  );
  const tracking =
    input.status === "shipped" && input.trackingNumber
      ? `Código de rastreio: ${input.trackingNumber}${input.carrier ? `\nTransportadora: ${input.carrier}` : ""}\nAcompanhar entrega: ${trackingUrl(input.trackingNumber)}`
      : "";
  const help =
    "Qualquer dúvida, é só chamar a gente no WhatsApp. Estamos à disposição para ajudar você em cada etapa.";
  const text = [
    `Olá, ${input.name.trim().split(/\s+/)[0] || "cliente"}!`,
    copy.body,
    `Pedido: ${input.code}\nStatus: ${ORDER_LABELS[input.status]}\nTotal: ${total}`,
    tracking,
    copy.next,
    `Acompanhar pedido: ${input.orderUrl}`,
    help,
    input.whatsappUrl
      ? `WhatsApp: ${input.whatsappUrl}`
      : "Você também pode responder a este e-mail.",
    "Com carinho,\nEquipe Absoluto Glamur",
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<div style="background:#f6f3f5;padding:24px;font-family:Arial,sans-serif;color:#251e23"><div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;padding:32px"><p style="letter-spacing:2px;color:#6d405f">ABSOLUTO GLAMUR</p><h1 style="font-size:25px">${escape(copy.title)}</h1><p>Olá, ${escape(input.name.trim().split(/\s+/)[0] || "cliente")}!</p><p style="line-height:1.7">${escape(copy.body)}</p><div style="background:#f6f3f5;padding:16px;border-radius:10px">Pedido <b>${escape(input.code)}</b><br>${escape(ORDER_LABELS[input.status])}<br>Total: ${escape(total)}</div>${tracking ? `<p style="line-height:1.7"><b>Código de rastreio: ${escape(input.trackingNumber!)}</b>${input.carrier ? `<br>Transportadora: ${escape(input.carrier)}` : ""}<br><a href="${escape(trackingUrl(input.trackingNumber!))}">Acompanhar entrega</a></p>` : ""}<p style="line-height:1.7">${escape(copy.next)}</p><p><a href="${escape(input.orderUrl)}" style="display:inline-block;padding:13px 22px;background:#6d405f;color:white;border-radius:8px;text-decoration:none">Acompanhar meu pedido</a></p><p style="line-height:1.7">${help}</p>${input.whatsappUrl ? `<p><a href="${escape(input.whatsappUrl)}">Conversar no WhatsApp</a></p>` : "<p>Você também pode responder a este e-mail.</p>"}<p>Com carinho,<br><b>Equipe Absoluto Glamur</b></p></div></div>`;
  return {
    subject: `${copy.title} · Pedido ${input.code}`,
    text,
    html,
    attachments: tracking
      ? [
          {
            filename: `rastreio-${input.code.replace(/[^a-zA-Z0-9_-]/g, "")}.txt`,
            content: `Pedido ${input.code}\n\n${tracking}\n\n${help}${input.whatsappUrl ? `\n${input.whatsappUrl}` : ""}`,
          },
        ]
      : undefined,
  };
}
