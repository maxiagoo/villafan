export type Project = {
  id: string;
  title: string;
  category: string;
  description: string;
  price_min: number;
  price_max: number;
  tone: string;
};
export type RequestItem = {
  id: string;
  user_id: string;
  project_id?: string | null;
  customer_name: string;
  contact: string;
  environment: string;
  description: string;
  status: string;
  created_at: string;
  photos?: string[];
};
export const formatMoney = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export function parseCents(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value > 0 && value <= 10000000000
    ? value
    : null;
}
export function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
