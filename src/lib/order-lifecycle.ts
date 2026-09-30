export const ORDER_LABELS: Record<string, string> = {
  pending: "Pedido recebido",
  awaiting_payment: "Aguardando confirmação do pagamento",
  validating: "Pagamento em validação",
  paid: "Pagamento concluído",
  processing: "Em separação",
  shipped: "Despachado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  failed: "Pagamento não concluído",
};
export const ORDER_STEPS = [
  "awaiting_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
] as const;
export function isPaidOrder(status: string) {
  return ["paid", "processing", "shipped", "delivered"].includes(status);
}
export function canTransitionOrder(from: string, to: string, tracking?: string | null) {
  if (to === "processing") return from === "paid";
  if (to === "shipped") return from === "processing" && !!tracking?.trim();
  if (to === "delivered") return from === "shipped";
  return false;
}
export const TRACKING_LABELS: Record<string, string> = {
  NotFound: "Aguardando atualização da transportadora",
  InfoReceived: "Informações de envio recebidas",
  InTransit: "Em trânsito",
  Expired: "Rastreio sem atualização",
  AvailableForPickup: "Disponível para retirada",
  OutForDelivery: "Saiu para entrega",
  DeliveryFailure: "Tentativa de entrega não concluída",
  Delivered: "Entregue",
  Exception: "Ocorrência no transporte",
};
export function trackingUrl(number: string) {
  return `https://t.17track.net/pt#nums=${encodeURIComponent(number)}`;
}
export function safeWhatsApp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/^[+\d\s()-]+$/.test(value)) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      ["wa.me", "api.whatsapp.com", "web.whatsapp.com"].includes(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export const TRACKING_SUB_LABELS: Record<string, string> = {
  InTransit_PickedUp: "Coletado pela transportadora",
  InTransit_Departure: "Saiu do país de origem",
  InTransit_Arrival: "Chegou ao país de destino",
  InTransit_CustomsProcessing: "Em análise aduaneira",
  InTransit_CustomsReleased: "Liberado pela alfândega",
  InTransit_CustomsRequiringInformation: "Alfândega solicitou informações",
  Exception_Returning: "Em devolução ao remetente",
  Exception_Returned: "Devolvido ao remetente",
  Exception_Lost: "Extravio informado pela transportadora",
  Exception_Damaged: "Avaria informada pela transportadora",
};
export function trackingLabel(value: string) {
  return (
    TRACKING_SUB_LABELS[value] ||
    TRACKING_LABELS[value.split("_")[0]] ||
    "Atualização da transportadora"
  );
}
