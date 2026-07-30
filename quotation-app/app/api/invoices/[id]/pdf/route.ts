import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getXeroClientForConnection } from "@/lib/xero/client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("xero_invoice_id, invoice_number")
    .eq("id", id)
    .single();

  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  if (!invoice.xero_invoice_id) {
    return NextResponse.json(
      { error: "Push this invoice to Xero to download its PDF." },
      { status: 409 }
    );
  }

  try {
    const { xero, tenantId } = await getXeroClientForConnection();
    const { body } = await xero.accountingApi.getInvoiceAsPdf(tenantId, invoice.xero_invoice_id);

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number || invoice.xero_invoice_id}.pdf"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to fetch the invoice PDF from Xero";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
