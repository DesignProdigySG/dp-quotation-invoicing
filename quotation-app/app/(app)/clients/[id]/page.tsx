import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientForm from "../ClientForm";
import ClientBillingAddresses from "../ClientBillingAddresses";
import PoolsSection from "../PoolsSection";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: client }, { data: billingAddresses }, { data: pools }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase
      .from("client_billing_addresses")
      .select("id, label, address")
      .eq("client_id", id)
      .order("label"),
    supabase
      .from("pools")
      .select("id, name, parent_pool_id")
      .eq("client_id", id)
      .order("name"),
  ]);

  if (!client) notFound();

  const poolsWithBalance = await Promise.all(
    (pools || []).map(async (pool) => {
      const { data: balance } = await supabase.rpc("pool_balance", { p_pool_id: pool.id });
      return { ...pool, balance: balance ?? 0 };
    })
  );

  return (
    <>
      <div className="page-header">
        <h1>{client.name}</h1>
      </div>
      <ClientForm clientId={client.id} initial={client} />
      <PoolsSection
        clientId={client.id}
        currency={client.default_currency}
        initialPools={poolsWithBalance}
      />
      <ClientBillingAddresses clientId={client.id} initialAddresses={billingAddresses || []} />
    </>
  );
}
