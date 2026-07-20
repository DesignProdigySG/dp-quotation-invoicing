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

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*, clients(name, contact_name, contact_email), invoice_line_items(*)")
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const lineItems = ((invoice as any).invoice_line_items || []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order
  );

  const buffer = await renderToBuffer(
    createElement(DocumentPdf, {
      docType: "INVOICE",
      docNumber: invoice.invoice_number || invoice.id,
      docDate: invoice.invoice_date,
      dueDate: invoice.due_date,
      status: invoice.status,
      client: (invoice as any).clients,
      currency: invoice.currency,
      gstRate: invoice.gst_rate,
      lineItems,
      notes: invoice.notes,
    }) as Parameters<typeof renderToBuffer>[0]
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
    },
  });
}
