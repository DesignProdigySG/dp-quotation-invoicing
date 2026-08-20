"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PoolInput = {
  client_id: string;
  parent_pool_id: string | null;
  name: string;
};

export async function createPool(input: PoolInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("pools")
    .insert({
      owner_id: user.id,
      client_id: input.client_id,
      parent_pool_id: input.parent_pool_id,
      name: input.name,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${input.client_id}`);
  if (input.parent_pool_id) {
    revalidatePath(`/clients/${input.client_id}/pools/${input.parent_pool_id}`);
  }
  return data;
}

export async function deletePool(poolId: string, clientId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pools").delete().eq("id", poolId);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${clientId}`);
}

export type DepositInput = {
  pool_id: string;
  client_id: string;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  fee_rate: number;
  purpose: string | null;
  deposit_date: string;
  status: "pending" | "confirmed";
};

// sgd_amount/fee_amount/net_amount are derived here (not trusted from the
// client) so the ledger's SGD-normalized figures always agree with what the
// user actually entered — same reasoning as computeTotals being recomputed
// server-side rather than trusting a client-sent total.
export async function recordDeposit(input: DepositInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const sgdAmount = input.exchange_rate ? input.amount * input.exchange_rate : input.amount;
  const feeAmount = sgdAmount * (input.fee_rate / 100);
  const netAmount = sgdAmount - feeAmount;

  const { error } = await supabase.from("deposits").insert({
    owner_id: user.id,
    pool_id: input.pool_id,
    amount: input.amount,
    currency: input.currency,
    sgd_amount: sgdAmount,
    exchange_rate: input.exchange_rate,
    fee_rate: input.fee_rate,
    fee_amount: feeAmount,
    net_amount: netAmount,
    purpose: input.purpose,
    deposit_date: input.deposit_date,
    status: input.status,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${input.client_id}/pools/${input.pool_id}`);
}

export async function confirmDeposit(depositId: string, clientId: string, poolId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("deposits")
    .update({ status: "confirmed" })
    .eq("id", depositId);
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${clientId}/pools/${poolId}`);
}

export type DrawdownInput = {
  pool_id: string;
  client_id: string;
  vendor_name: string;
  is_internal: boolean;
  amount: number;
  currency: string;
  exchange_rate: number | null;
  description: string | null;
  drawdown_date: string;
  notes: string | null;
};

export async function recordDrawdown(input: DrawdownInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const sgdAmount = input.exchange_rate ? input.amount * input.exchange_rate : input.amount;

  const { error } = await supabase.from("drawdowns").insert({
    owner_id: user.id,
    pool_id: input.pool_id,
    vendor_name: input.vendor_name,
    is_internal: input.is_internal,
    amount: input.amount,
    currency: input.currency,
    sgd_amount: sgdAmount,
    exchange_rate: input.exchange_rate,
    description: input.description,
    drawdown_date: input.drawdown_date,
    notes: input.notes,
  });
  // The overdraw-prevention trigger raises a plain Postgres exception here —
  // its message is surfaced as-is, same as every other Supabase error in
  // this app (see billingAddressActions.ts, invoices/actions.ts).
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${input.client_id}/pools/${input.pool_id}`);
}

export type TransferInput = {
  from_pool_id: string;
  to_pool_id: string;
  client_id: string;
  amount: number;
  reason: string | null;
  transfer_date: string;
};

export async function recordTransfer(input: TransferInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("pool_transfers").insert({
    owner_id: user.id,
    from_pool_id: input.from_pool_id,
    to_pool_id: input.to_pool_id,
    amount: input.amount,
    reason: input.reason,
    transfer_date: input.transfer_date,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${input.client_id}/pools/${input.from_pool_id}`);
  revalidatePath(`/clients/${input.client_id}/pools/${input.to_pool_id}`);
}

export type AdjustmentInput = {
  pool_id: string;
  client_id: string;
  amount: number; // signed: positive = credit, negative = debit
  reason: string;
  related_deposit_id: string | null;
  related_drawdown_id: string | null;
};

export async function recordAdjustment(input: AdjustmentInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { error } = await supabase.from("pool_adjustments").insert({
    owner_id: user.id,
    pool_id: input.pool_id,
    amount: input.amount,
    reason: input.reason,
    related_deposit_id: input.related_deposit_id,
    related_drawdown_id: input.related_drawdown_id,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/clients/${input.client_id}/pools/${input.pool_id}`);
}
