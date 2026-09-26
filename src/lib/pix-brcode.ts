// Gerador de BR Code (PIX copia e cola) — padrão EMV do Banco Central.

function emv(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

function sanitize(text: string, max: number): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 .,-]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PixPayloadInput = {
  key: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid?: string | null;
  description?: string | null;
};

export function buildPixPayload(input: PixPayloadInput): string {
  const key = input.key.trim();
  if (!key) throw new Error("Chave PIX não configurada.");

  const description = input.description ? sanitize(input.description, 40) : "";
  const merchantAccount =
    emv("00", "br.gov.bcb.pix") + emv("01", key) + (description ? emv("02", description) : "");

  const txid = (input.txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";
  const amount = (input.amountCents / 100).toFixed(2);

  const payload =
    emv("00", "01") +
    emv("01", "12") +
    emv("26", merchantAccount) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", amount) +
    emv("58", "BR") +
    emv("59", sanitize(input.merchantName || "LOJA", 25)) +
    emv("60", sanitize(input.merchantCity || "SAO PAULO", 15)) +
    emv("62", emv("05", txid)) +
    "6304";

  return payload + crc16(payload);
}
