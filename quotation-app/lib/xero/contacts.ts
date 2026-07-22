import type { XeroClient } from "xero-node";
import { createClient } from "@/lib/supabase/server";

export type ClientForXero = {
  id: string;
  name: string;
  contact_email: string | null;
  xero_contact_id: string | null;
};

// Escapes a client name for Xero's `where` filter clause. Client names are
// freeform user input and could contain a double quote, which would
// otherwise break the filter's string literal.
function escapeForXeroFilter(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function findOrCreateXeroContact(
  xero: XeroClient,
  tenantId: string,
  client: ClientForXero
): Promise<string> {
  if (client.xero_contact_id) return client.xero_contact_id;

  const { body: searchResult } = await xero.accountingApi.getContacts(
    tenantId,
    undefined,
    `Name=="${escapeForXeroFilter(client.name)}"`
  );
  let contactId = searchResult.contacts?.[0]?.contactID;

  if (!contactId) {
    const { body: created } = await xero.accountingApi.createContacts(tenantId, {
      contacts: [
        {
          name: client.name,
          emailAddress: client.contact_email ?? undefined,
        },
      ],
    });
    contactId = created.contacts?.[0]?.contactID;
  }

  if (!contactId) {
    throw new Error("Could not find or create a Xero contact for this client");
  }

  const supabase = await createClient();
  await supabase.from("clients").update({ xero_contact_id: contactId }).eq("id", client.id);

  return contactId;
}
