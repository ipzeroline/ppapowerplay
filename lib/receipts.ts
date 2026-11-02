// Receipt numbers run per Buddhist year (Bangkok calendar): RC2569-000001, RC2569-000002, ...
// Numbers are taken from receipt_sequences inside the transaction that records the receipt, so a
// rolled-back issue leaves no gap and two staff printing at once never share a number.

export function beYear(now = Date.now()) {
  return new Date(now + 7 * 3_600_000).getUTCFullYear() + 543;
}

export function formatReceiptNo(year: number, sequence: number) {
  return `RC${year}-${String(sequence).padStart(6, "0")}`;
}

// VAT-included price (Thai VAT 7%): the tax inside the amount, in satang so net + vat is the amount.
export function vatIncluded(amount: number) {
  const total = Math.round(amount * 100);
  const vat = Math.round((total * 7) / 107);
  return { net: (total - vat) / 100, vat: vat / 100 };
}
