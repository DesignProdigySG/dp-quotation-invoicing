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
    .select("*, clients(name), invoice_line_items(*)")
    .eq("id", id)
    .single();

  if (!invoice) notFound();

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
            {invoice.quotation_id ? " · converted from a quotation" : ""}
          </p>
        </div>
      </div>

      <div className="card">
        <InvoiceActions invoiceId={invoice.id} status={invoice.status} />
      </div>

      <InvoiceForm
        invoiceId={invoice.id}
        currency={invoice.currency}
        gstRate={invoice.gst_rate}
        initial={{
          due_date: invoice.due_date,
          notes: invoice.notes || "",
          line_items: lineItems,
        }}
      />
    </>
  );
}
