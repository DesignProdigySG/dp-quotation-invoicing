import type { Connection } from "jsforce";

export type SalesforcePicklistValue = {
  value: string;
  label: string;
  active: boolean;
};

export type SalesforceFieldInfo = {
  name: string;
  type: string;
  picklistValues: SalesforcePicklistValue[];
};

// Resolves an Opportunity field's real API name/type/picklist values by its
// visible label via Salesforce's describe() API, rather than hardcoding a
// custom field's API name — custom field API names are unpredictable and
// org-specific, but labels are exactly what a user sees in Salesforce's UI
// and in validation error messages. Returns null if genuinely not found (a
// normal, expected outcome — callers decide how to handle it); throws a
// plain Error only on an actual connection/API failure, matching
// findOrCreateSalesforceAccount's convention.
export async function findOpportunityFieldByLabel(
  conn: Connection,
  label: string
): Promise<SalesforceFieldInfo | null> {
  const described = await conn.sobject("Opportunity").describe();
  const target = label.trim().toLowerCase();
  const field = described.fields.find((f) => f.label.trim().toLowerCase() === target);
  if (!field) return null;

  return {
    name: field.name,
    type: field.type,
    picklistValues: (field.picklistValues || []) as SalesforcePicklistValue[],
  };
}
