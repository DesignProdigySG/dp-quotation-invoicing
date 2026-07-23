import { Account, TaxRate, type XeroClient } from "xero-node";

export type XeroTaxRateOption = { taxType: string; name: string; ratePercent: number };
export type XeroAccountOption = { code: string; name: string };

export async function listTaxRates(
  xero: XeroClient,
  tenantId: string
): Promise<XeroTaxRateOption[]> {
  const { body } = await xero.accountingApi.getTaxRates(tenantId);
  return (body.taxRates || [])
    .filter(
      (rate) =>
        rate.status === TaxRate.StatusEnum.ACTIVE &&
        rate.taxType &&
        rate.name &&
        // This app only ever creates ACCREC (sales) invoices — a tax rate
        // that isn't valid on a revenue account will always be rejected by
        // Xero at push time (confirmed directly: "TaxType code 'X' cannot
        // be used with account code 'Y'"), so don't offer it as a choice.
        rate.canApplyToRevenue
    )
    .map((rate) => ({
      taxType: rate.taxType!,
      name: rate.name!,
      // Sum tax components rather than just taking the first, in case a
      // compound tax rate has more than one component.
      ratePercent: (rate.taxComponents || []).reduce((sum, c) => sum + (c.rate || 0), 0),
    }));
}

export async function listAccounts(
  xero: XeroClient,
  tenantId: string
): Promise<XeroAccountOption[]> {
  const { body } = await xero.accountingApi.getAccounts(
    tenantId,
    undefined,
    `Status=="ACTIVE"`
  );
  return (body.accounts || [])
    .filter(
      (account) =>
        account.code &&
        account.name &&
        // Same reasoning as the tax rate filter above — every invoice this
        // app creates is a sales invoice, so only revenue accounts are ever
        // valid choices.
        account._class === Account.ClassEnum.REVENUE
    )
    .map((account) => ({ code: account.code!, name: account.name! }));
}
