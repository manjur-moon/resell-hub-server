export function generateTransactionId() {
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `RH-TRX-${datePart}-${randomPart}`;
}
