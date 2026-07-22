import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientForm from "../ClientForm";
import ClientBillingAddresses from "../ClientBillingAddresses";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: client }, { data: billingAddresses }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("client_billing_addresses")
      .select("id, label, address")
      .eq("client_id", id)
      .order("label"),
  ]);

  if (!client) notFound();

  return (
    <>
      <div className="page-header">
        <h1>{client.name}</h1>
      </div>
      <ClientForm clientId={client.id} initial={client} />
      <ClientBillingAddresses clientId={client.id} initialAddresses={billingAddresses || []} />
    </>
  );
}
