import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PoolDetail from "./PoolDetail";

export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ id: string; poolId: string }>;
}) {
  const { id: clientId, poolId } = await params;
  const supabase = await createClient();

  const [{ data: client }, { data: pool }, { data: balance }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, default_currency, default_management_fee_rate")
      .eq("id", clientId)
      .single(),
    supabase.from("pools").select("*").eq("id", poolId).eq("client_id", clientId).single(),
    supabase.rpc("pool_balance", { p_pool_id: poolId }),
  ]);

  if (!client || !pool) notFound();

  // Walk the parent chain for a breadcrumb — depth is always shallow
  // (client -> department -> optional further nesting), so a simple loop is
  // fine rather than a recursive CTE.
  const breadcrumb: { id: string; name: string }[] = [];
  let cursor = pool.parent_pool_id;
  while (cursor) {
    const { data: parent } = await supabase
      .from("pools")
      .select("id, name, parent_pool_id")
      .eq("id", cursor)
      .single();
    if (!parent) break;
    breadcrumb.unshift({ id: parent.id, name: parent.name });
    cursor = parent.parent_pool_id;
  }

  const [
    { data: subPools },
    { data: otherPools },
    { data: deposits },
    { data: drawdowns },
    { data: transfersOut },
    { data: transfersIn },
    { data: adjustments },
  ] = await Promise.all([
    supabase.from("pools").select("id, name").eq("parent_pool_id", poolId).order("name"),
    supabase
      .from("pools")
      .select("id, name")
      .eq("client_id", clientId)
      .neq("id", poolId)
      .order("name"),
    supabase
      .from("deposits")
      .select("*")
      .eq("pool_id", poolId)
      .order("deposit_date", { ascending: false }),
    supabase
      .from("drawdowns")
      .select("*")
      .eq("pool_id", poolId)
      .order("drawdown_date", { ascending: false }),
    supabase
      .from("pool_transfers")
      .select("*, to_pool:pools!pool_transfers_to_pool_id_fkey(name)")
      .eq("from_pool_id", poolId)
      .order("transfer_date", { ascending: false }),
    supabase
      .from("pool_transfers")
      .select("*, from_pool:pools!pool_transfers_from_pool_id_fkey(name)")
      .eq("to_pool_id", poolId)
      .order("transfer_date", { ascending: false }),
    supabase
      .from("pool_adjustments")
      .select("*")
      .eq("pool_id", poolId)
      .order("created_at", { ascending: false }),
  ]);

  const subPoolsWithBalance = await Promise.all(
    (subPools || []).map(async (sub) => {
      const { data: subBalance } = await supabase.rpc("pool_balance", { p_pool_id: sub.id });
      return { ...sub, balance: subBalance ?? 0 };
    })
  );

  return (
    <>
      <div className="page-header">
        <h1>
          <Link href={`/clients/${clientId}`}>{client.name}</Link>
          {breadcrumb.map((b) => (
            <span key={b.id}>
              {" / "}
              <Link href={`/clients/${clientId}/pools/${b.id}`}>{b.name}</Link>
            </span>
          ))}
          {" / "}
          {pool.name}
        </h1>
      </div>
      <PoolDetail
        clientId={clientId}
        pool={pool}
        balance={balance ?? 0}
        currency={client.default_currency}
        defaultFeeRate={client.default_management_fee_rate}
        subPools={subPoolsWithBalance}
        otherPools={otherPools || []}
        deposits={deposits || []}
        drawdowns={drawdowns || []}
        transfersOut={(transfersOut || []) as any}
        transfersIn={(transfersIn || []) as any}
        adjustments={adjustments || []}
      />
    </>
  );
}
