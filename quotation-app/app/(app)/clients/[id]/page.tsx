import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ClientForm from "../ClientForm";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!client) notFound();

  return (
    <>
      <div className="page-header">
        <h1>{client.name}</h1>
      </div>
      <ClientForm clientId={client.id} initial={client} />
    </>
  );
}
