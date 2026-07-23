"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LineItemInput } from "../quotes/actions";
import { getXeroClientForConnection } from "@/lib/xero/client";
import { findOrCreateXeroContact } from "@/lib/xero/contacts";
import { buildInvoicePayload } from "@/lib/xero/buildInvoicePayload";
import { describeXeroError } from "@/lib/xero/describeError";

export type InvoiceInput = {
  due_date: string | null;
  reference?: string | null;
  exchange_rate?: number | null;
  display_currency: "original" | "sgd";
  billing_address_id?: string | null;
  billing_address?: string | null;
  notes?: string;
  line_items: LineItemInput[];
};

export async function updateInvoice(id: string, input: InvoiceInput) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("invoices")
    .update({
      due_date: input.due_date,
      reference: input.reference || null,
      exchange_rate: input.exchange_rate ?? null,
      display_currency: input.display_currency,
      billing_address_id: input.billing_address_id ?? null,
      billing_address: input.billing_address ?? null,
      notes: input.notes || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  const { error: delError } = await supabase
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", id);
  if (delError) throw new Error(delError.message);

  if (input.line_items.length > 0) {
    const { error: liError } = await supabase.from("invoice_line_items").insert(
      input.line_items.map((li, idx) => ({
        invoice_id: id,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        sort_order: idx,
      }))
    );
    if (liError) throw new Error(liError.message);
  }

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/board");
}

export async function setInvoiceStatus(id: string, status: "Draft" | "Sent" | "Paid") {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/board");
}

export async function deleteInvoice(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("invoices").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/invoices");
  revalidatePath("/board");
}

// Never throws — same convention as the Settings actions this mirrors:
// failures are returned as { error } and also persisted onto the invoice row
// (xero_push_error) so the state survives a page refresh and is visible to
// anyone looking at the invoice, not just whoever clicked the button.
export async function pushInvoiceToXero(invoiceId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("*, clients(id, name, contact_email, xero_contact_id), invoice_line_items(*)")
    .eq("id", invoiceId)
    .single();

  if (fetchError || !invoice) {
    return { error: "Invoice not found" };
  }

  const client = (invoice as any).clients as {
    id: string;
    name: string;
    contact_email: string | null;
    xero_contact_id: string | null;
  } | null;
  if (!client) {
    return { error: "This invoice has no client on record" };
  }

  const lineItems = ((invoice as any).invoice_line_items || [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((li: any) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
    }));

  async function recordFailure(message: string) {
    await supabase
      .from("invoices")
      .update({ xero_push_error: message })
      .eq("id", invoiceId);
    return { error: message };
  }

  try {
    const { xero, tenantId, connection } = await getXeroClientForConnection();

    const contactId = await findOrCreateXeroContact(xero, tenantId, client);

    const payload = buildInvoicePayload(
      {
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        invoice_number: invoice.invoice_number,
        reference: invoice.reference,
        currency: invoice.currency,
        gst_applicable: invoice.gst_applicable,
        gst_rate: invoice.gst_rate,
      },
      lineItems,
      contactId,
      connection
    );

    // Persist the idempotency key before calling Xero (or reuse one from a
    // prior failed attempt) so a crash between "Xero received it" and "we
    // recorded the result" can be retried safely without double-creating
    // the invoice in Xero.
    const idempotencyKey = invoice.xero_idempotency_key ?? randomUUID();
    if (!invoice.xero_idempotency_key) {
      await supabase
        .from("invoices")
        .update({ xero_idempotency_key: idempotencyKey })
        .eq("id", invoiceId);
    }

    const { body } = await xero.accountingApi.createInvoices(
      tenantId,
      { invoices: [payload] },
      true,
      undefined,
      idempotencyKey
    );
    const created = body.invoices?.[0];
    if (!created?.invoiceID) {
      return await recordFailure("Xero didn't return a created invoice");
    }

    const { error: updateError } = await supabase
      .from("invoices")
      .update({
        xero_invoice_id: created.invoiceID,
        xero_status: created.status ? String(created.status) : null,
        xero_pushed_at: new Date().toISOString(),
        xero_push_error: null,
        invoice_number: invoice.invoice_number ?? created.invoiceNumber ?? null,
      })
      .eq("id", invoiceId);
    if (updateError) return { error: updateError.message };

    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    return {};
  } catch (e) {
    return await recordFailure(describeXeroError(e));
  }
}
