// Thai PromptPay QR payload (EMVCo merchant-presented, Bank of Thailand profile).
// Works with any Thai banking app; no payment provider is involved — staff still confirm
// the transfer (slip) before rights are granted.

const promptPayAid = "A000000677010111";

function field(tag: string, value: string) {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

// CRC-16/CCITT-FALSE: polynomial 0x1021, initial value 0xFFFF.
function crc16(text: string) {
  let crc = 0xffff;
  for (let index = 0; index < text.length; index += 1) {
    crc ^= text.charCodeAt(index) << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function digits(target: string) {
  return target.replace(/[\s-]/g, "");
}

// Mobile number (10 digits starting with 0), national/tax ID (13) or e-wallet ID (15).
export function promptPayTargetValid(target: string) {
  const value = digits(target);
  return /^0\d{9}$/.test(value) || /^\d{13}$/.test(value) || /^\d{15}$/.test(value);
}

export function promptPayPayload(target: string, amount?: number) {
  const value = digits(target);
  if (!promptPayTargetValid(value)) throw new Error("Invalid PromptPay ID");
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) throw new Error("Invalid PromptPay amount");
  const account = value.length === 15 ? field("03", value) : value.length === 13 ? field("02", value) : field("01", `0066${value.slice(1)}`);
  const body = [
    field("00", "01"),
    field("01", amount ? "12" : "11"),
    field("29", field("00", promptPayAid) + account),
    field("58", "TH"),
    field("53", "764"),
    amount ? field("54", amount.toFixed(2)) : "",
  ].join("");
  const unsigned = `${body}6304`;
  return `${unsigned}${crc16(unsigned)}`;
}

// Shows only the last digits of the receiving account to members.
export function maskPromptPayTarget(target: string) {
  const value = digits(target);
  return value.length > 4 ? `${"•".repeat(Math.min(6, value.length - 4))}${value.slice(-4)}` : value;
}
