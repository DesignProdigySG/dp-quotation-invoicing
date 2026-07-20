import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

type LineItemInput = {
  description: string;
  quantity: number;
  unit_price: number;
};

type FromEmailInput = {
  owner_id: string;
  client_id: string;
  items: LineItemInput[];
  notes?: string;
  currency?: string;
  gst_rate?: number;
};

export async function POST(request: NextRequest) {
  const expected = process.env.EMAIL_QUOTE_WEBHOOK_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<FromEmailInput>;
  const { owner_id, client_id, items, notes } = body;
  let { currency, gst_rate } = body;

  if (!owner_id || !client_id || !items || items.length === 0) {
    return NextResponse.json(
      { error: "owner_id, client_id, and at least one item are required" },
      { status: 400 }
    );
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

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: liError } = await supabase.from("quotation_line_items").insert(
    items.map((item, idx) => ({
      quotation_id: quotation.id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: idx,
    }))
  );

  if (liError) {
    return NextResponse.json({ error: liError.message }, { status: 500 });
  }

  return NextResponse.json({ quotation_id: quotation.id }, { status: 201 });
}
