import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InvoiceForm from "../InvoiceForm";
import InvoiceActions from "../InvoiceActions";

function StatusBadge({ status }: { status: string }) {
  return <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>;
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("invoices")
    .select("*, clients(name, billing_address), invoice_line_items(*)")
    .eq("id", id)
    .single();

  if (!invoice) notFound();

  const { data: billingAddresses } = await supabase
    .from("client_billing_addresses")
    .select("id, label, address")
    .eq("client_id", invoice.client_id);

  const lineItems = ((invoice as any).invoice_line_items || [])
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((li: any) => ({
      description: li.description,
      quantity: li.quantity,
      unit_price: li.unit_price,
    }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>
            {invoice.invoice_number} <StatusBadge status={invoice.status} />
          </h1>
          <p className="subtitle">
            {(invoice as any).clients?.name}
            {invoice.quotation_id ? " · converted from a quotation" : ""} · Created{" "}
            {new Date(invoice.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      <div className="card">
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          xeroInvoiceId={invoice.xero_invoice_id}
          xeroStatus={invoice.xero_status}
          xeroPushedAt={invoice.xero_pushed_at}
          xeroPushError={invoice.xero_push_error}
        />
      </div>

      <InvoiceForm
        invoiceId={invoice.id}
        currency={invoice.currency}
        gstRate={invoice.gst_rate}
        gstApplicable={invoice.gst_applicable}
        clientDefaultBillingAddress={(invoice as any).clients?.billing_address ?? null}
        billingAddresses={billingAddresses || []}
        initial={{
          due_date: invoice.due_date,
          reference: invoice.reference,
          exchange_rate: invoice.exchange_rate,
          display_currency: invoice.display_currency as "original" | "sgd",
          billing_address_id: invoice.billing_address_id,
          billing_address: invoice.billing_address,
          notes: invoice.notes || "",
          line_items: lineItems,
        }}
      />
    </>
  );
}
