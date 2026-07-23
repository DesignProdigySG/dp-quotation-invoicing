"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LineItemInput } from "../quotes/actions";
import { getXeroClientForConnection } from "@/lib/xero/client";
import { findOrCreateXeroContact } from "@/lib/xero/contacts";
import { buildInvoicePayload } from "@/lib/xero/buildInvoicePayload";
import { describeXeroError } from "@/lib/xero/describeError";
import { computeInvoiceUpdateFromXero } from "@/lib/xero/applyXeroInvoiceToRow";
import type { AppStatus } from "@/lib/xero/nextAppStatus";

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

    let created;
    try {
      const { body } = await xero.accountingApi.createInvoices(
        tenantId,
        { invoices: [payload] },
        true,
        undefined,
        idempotencyKey
      );
      created = body.invoices?.[0];
    } catch (e) {
      // Xero rejects a retried idempotency key outright if the request body
      // differs from the original attempt ("used with a different
      // request") — confirmed directly, not theoretical: this happened when
      // retrying after fixing a bad tax-rate/account-code Settings mapping,
      // since that changes the payload. If Xero gave us any HTTP response at
      // all (even a rejection), the key is now spent for that payload, so
      // clear it — the next attempt (same or different data) needs a fresh
      // one. Only keep the key when there's truly no response at all (a
      // network/timeout failure where it's genuinely unknown whether Xero
      // received the request) — that's the one case where retrying with the
      // same key and same payload is both safe and necessary.
      const xeroResponded = !!(e && typeof e === "object" && "response" in (e as object));
      if (xeroResponded) {
        await supabase
          .from("invoices")
          .update({ xero_idempotency_key: null })
          .eq("id", invoiceId);
      }
      return await recordFailure(describeXeroError(e));
    }
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
        // Prefer Xero's own generated number now that we don't send ours —
        // it usually assigns one immediately, but if the org has automatic
        // numbering off it can come back blank, in which case keep this
        // app's placeholder until a later "Refresh from Xero" picks up a
        // real one.
        invoice_number: created.invoiceNumber || invoice.invoice_number,
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

// Pulls the latest status (and invoice number, once Xero has assigned one)
// for an invoice that's already been pushed. Manual button, not automatic
// polling/webhooks — confirmed with the user that's the simplest option and
// needs no extra Xero portal config. Same never-throw / persist-failure
// convention as pushInvoiceToXero above.
export async function refreshInvoiceFromXero(invoiceId: string): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: invoice, error: fetchError } = await supabase
    .from("invoices")
    .select("xero_invoice_id, invoice_number, status")
    .eq("id", invoiceId)
    .single();

  if (fetchError || !invoice) {
    return { error: "Invoice not found" };
  }
  if (!invoice.xero_invoice_id) {
    return { error: "This invoice hasn't been pushed to Xero yet" };
  }

  async function recordFailure(message: string) {
    await supabase
      .from("invoices")
      .update({ xero_push_error: message })
      .eq("id", invoiceId);
    return { error: message };
  }

  try {
    const { xero, tenantId } = await getXeroClientForConnection();

    const { body } = await xero.accountingApi.getInvoice(tenantId, invoice.xero_invoice_id);
    const fetched = body.invoices?.[0];
    if (!fetched) {
      return await recordFailure("Xero didn't return this invoice");
    }

    const update = computeInvoiceUpdateFromXero(
      { status: invoice.status as AppStatus, invoice_number: invoice.invoice_number ?? "" },
      fetched
    );

    const { error: updateError } = await supabase
      .from("invoices")
      .update(update)
      .eq("id", invoiceId);
    if (updateError) return { error: updateError.message };

    revalidatePath(`/invoices/${invoiceId}`);
    revalidatePath("/invoices");
    return {};
  } catch (e) {
    return await recordFailure(describeXeroError(e));
  }
}

export type CheckXeroStatusResult = {
  error?: string;
  checked: number;
  updatedToPaid: number;
  updatedToSent: number;
};

// Xero's own page size ceiling for a getInvoices request — chunk any
// larger candidate list so a big `iDs` filter can't hit a request-size limit.
const XERO_GET_INVOICES_CHUNK_SIZE = 100;

// Bulk counterpart to refreshInvoiceFromXero: checks every not-yet-Paid
// pushed invoice against Xero in as few API calls as possible (Xero's
// getInvoices supports fetching many specific invoices by ID in one call,
// unlike getInvoice which only takes one). Each row's update is independent,
// so a Xero error partway through still leaves the successfully-checked rows
// correctly updated — the partial counts are returned alongside the error
// rather than treated as a failed transaction.
export async function checkInvoicesAgainstXero(): Promise<CheckXeroStatusResult> {
  const supabase = await createClient();

  const { data: candidates, error: fetchError } = await supabase
    .from("invoices")
    .select("id, status, invoice_number, xero_invoice_id")
    .in("status", ["Draft", "Sent"])
    .not("xero_invoice_id", "is", null);

  if (fetchError) {
    return { error: fetchError.message, checked: 0, updatedToPaid: 0, updatedToSent: 0 };
  }
  if (!candidates || candidates.length === 0) {
    return { checked: 0, updatedToPaid: 0, updatedToSent: 0 };
  }

  let updatedToPaid = 0;
  let updatedToSent = 0;

  try {
    const { xero, tenantId } = await getXeroClientForConnection();
    const byXeroId = new Map(candidates.map((c) => [c.xero_invoice_id as string, c]));
    const ids = candidates.map((c) => c.xero_invoice_id as string);

    for (let i = 0; i < ids.length; i += XERO_GET_INVOICES_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + XERO_GET_INVOICES_CHUNK_SIZE);
      const { body } = await xero.accountingApi.getInvoices(
        tenantId,
        undefined,
        undefined,
        undefined,
        chunk
      );

      for (const fetched of body.invoices || []) {
        const local = fetched.invoiceID ? byXeroId.get(fetched.invoiceID) : undefined;
        if (!local) continue;

        const update = computeInvoiceUpdateFromXero(
          { status: local.status as AppStatus, invoice_number: local.invoice_number ?? "" },
          fetched
        );

        const { error: updateError } = await supabase
          .from("invoices")
          .update(update)
          .eq("id", local.id);
        if (updateError) {
          return {
            error: updateError.message,
            checked: candidates.length,
            updatedToPaid,
            updatedToSent,
          };
        }

        if (update.status === "Paid") updatedToPaid++;
        else if (update.status === "Sent") updatedToSent++;
      }
    }

    revalidatePath("/invoices");
    revalidatePath("/board");
    return { checked: candidates.length, updatedToPaid, updatedToSent };
  } catch (e) {
    return {
      error: describeXeroError(e),
      checked: candidates.length,
      updatedToPaid,
      updatedToSent,
    };
  }
}
