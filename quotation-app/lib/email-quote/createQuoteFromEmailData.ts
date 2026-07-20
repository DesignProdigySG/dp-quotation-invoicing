import { createServiceClient } from "@/lib/supabase/service";

export type LineItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

export type CreateQuoteFromEmailInput = {
  owner_id: string;
  client_id: string;
  items: LineItemInput[];
  notes?: string;
  currency?: string;
  gst_rate?: number;
};

export async function createQuoteFromEmailData(input: CreateQuoteFromEmailInput) {
  const { owner_id, client_id, items, notes } = input;
  let { currency, gst_rate } = input;

  if (!owner_id || !client_id || !items || items.length === 0) {
    throw new Error("owner_id, client_id, and at least one item are required");
  }

  const supabase = createServiceClient();

  const { data: client } = await supabase
    .from("clients")
    .select("default_currency, default_gst_rate, display_currency_preference")
    .eq("id", client_id)
    .single();
  currency = currency ?? client?.default_currency;
  gst_rate = gst_rate ?? client?.default_gst_rate;
  const display_currency = client?.display_currency_preference;

  const { data: quotation, error } = await supabase
    .from("quotations")
    .insert({
      owner_id,
      client_id,
      notes: notes || null,
      ...(currency !== undefined ? { currency } : {}),
      ...(gst_rate !== undefined ? { gst_rate } : {}),
      ...(display_currency !== undefined ? { display_currency } : {}),
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const { error: liError } = await supabase.from("quotation_line_items").insert(
    items.map((item, idx) => ({
      quotation_id: quotation.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: idx,
    }))
  );

  if (liError) throw new Error(liError.message);

  return { quotation_id: quotation.id as string };
}
