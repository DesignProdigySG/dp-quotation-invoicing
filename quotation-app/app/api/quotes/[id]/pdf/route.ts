import { createElement } from "react";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import DocumentPdf from "@/lib/pdf/DocumentPdf";
import { getSignatureDataUri } from "@/lib/profile/getSignatureDataUri";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: quotation, error } = await supabase
    .from("quotations")
    .select(
      "*, clients(name, billing_address), quotation_line_items(*)"
    )
    .eq("id", id)
    .single();

  if (error || !quotation) {
    return NextResponse.json({ error: "Quotation not found" }, { status: 404 });
  }

  // Externally-sourced quotation (imported from a document built outside
  // the app) — serve the original file instead of a self-rendered PDF,
  // which would just be a re-typed guess at a document we already have.
  if (quotation.external_quote_file_path) {
    const { data: signed } = await supabase.storage
      .from("external-quotes")
      .createSignedUrl(quotation.external_quote_file_path, 60);
    if (!signed?.signedUrl) {
      return NextResponse.json({ error: "Could not load the original file" }, { status: 500 });
    }
    return NextResponse.redirect(signed.signedUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, title, signature_path")
    .eq("owner_id", quotation.owner_id)
    .maybeSingle();
  const signatureDataUri = await getSignatureDataUri(supabase, profile?.signature_path ?? null);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const lineItems = ((quotation as any).quotation_line_items || []).sort(
    (a: any, b: any) => a.sort_order - b.sort_order
  );

  const resolvedBillingAddress =
    quotation.billing_address ?? (quotation as any).clients?.billing_address ?? null;

  const buffer = await renderToBuffer(
    createElement(DocumentPdf, {
      docType: "QUOTATION",
      docNumber: quotation.quote_number || quotation.id,
      docDate: quotation.quote_date,
      status: quotation.status,
      client: { ...(quotation as any).clients, billing_address: resolvedBillingAddress },
      currency: quotation.currency,
      gstRate: quotation.gst_rate,
      gstApplicable: quotation.gst_applicable,
      exchangeRate: quotation.exchange_rate,
      displayCurrency: quotation.display_currency as "original" | "sgd",
      lineItems,
      notes: quotation.notes,
      preparedBy: profile?.full_name
        ? { name: profile.full_name, title: profile.title, signatureDataUri }
        : null,
      preparedByEmail: user?.email ?? null,
      validUntil: quotation.valid_until ?? null,
    }) as Parameters<typeof renderToBuffer>[0]
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quotation.quote_number || quotation.id}.pdf"`,
    },
  });
}
