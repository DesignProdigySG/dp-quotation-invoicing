export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-SG", {
      style: "currency",
      currency: currency || "SGD",
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function computeTotals(
  lineItems: { quantity: number; unit_price: number }[],
  gstRate: number
) {
  const subtotal = lineItems.reduce(
    (sum, li) => sum + Number(li.quantity) * Number(li.unit_price),
    0
  );
  const gstAmount = subtotal * (Number(gstRate) / 100);
  const total = subtotal + gstAmount;
  return { subtotal, gstAmount, total };
}
