/** Converte o país da avaliação (código ISO-2 ou nome) em bandeira emoji. */

const NAME_TO_CODE: Record<string, string> = {
  brasil: "BR",
  brazil: "BR",
  portugal: "PT",
  "estados unidos": "US",
  "united states": "US",
  usa: "US",
  espanha: "ES",
  spain: "ES",
  frança: "FR",
  france: "FR",
  itália: "IT",
  italy: "IT",
  alemanha: "DE",
  germany: "DE",
  méxico: "MX",
  mexico: "MX",
  chile: "CL",
  argentina: "AR",
  colômbia: "CO",
  colombia: "CO",
  peru: "PE",
  "reino unido": "GB",
  "united kingdom": "GB",
  russia: "RU",
  rússia: "RU",
  china: "CN",
  japão: "JP",
  japan: "JP",
  coreia: "KR",
  korea: "KR",
  polônia: "PL",
  poland: "PL",
  holanda: "NL",
  netherlands: "NL",
  canadá: "CA",
  canada: "CA",
  austrália: "AU",
  australia: "AU",
  israel: "IL",
  ucrânia: "UA",
  ukraine: "UA",
  turquia: "TR",
  turkey: "TR",
  índia: "IN",
  india: "IN",
};

export function countryCode(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  return NAME_TO_CODE[raw.toLowerCase()] ?? null;
}

/** Bandeira emoji a partir do código ISO-2 (ex.: "BR" → 🇧🇷). */
export function countryFlag(input: string | null | undefined): string | null {
  const code = countryCode(input);
  if (!code) return null;
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65)));
}
