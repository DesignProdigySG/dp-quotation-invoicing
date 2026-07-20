import { createElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import DocumentPdf from "@/lib/pdf/DocumentPdf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select("*, clients(name, contact_name, contact_email), quotation_line_items(*)")
    .eq("id", id)
    .single();

  if (error || !quotation) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  }

  const lineItems = ((quotation as any).quotation_line_items || []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order
  );

  const buffer = await renderToBuffer(
    createElement(DocumentPdf, {
      docType: "QUOTATION",
      docNumber: quotation.quote_number || quotation.id,
      docDate: quotation.quote_date,
      status: quotation.status,
      client: (quotation as any).clients,
      currency: quotation.currency,
      gstRate: quotation.gst_rate,
      lineItems,
      notes: quotation.notes,
    }) as Parameters<typeof renderToBuffer>[0]
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotation.quote_number}.pdf"`,
    },
  });
}
