// Staff payment list (Dashboard, Reports → finance, and the list returned after a decision).
// Payments awaiting confirmation come first, so none of them drop off behind newer paid ones.
const columns = "p.payment_no paymentNo, COALESCE(JSON_VALUE(p.metadata, '$.guestName'), u.display_name) displayName, p.method, p.amount, p.status, p.created_at createdAt, p.paid_at paidAt, p.slip_uploaded_at slipUploadedAt, JSON_LENGTH(p.metadata, '$.previousSlips') previousSlipCount, JSON_VALUE(p.metadata, '$.refund.status') refundStatus, JSON_VALUE(p.metadata, '$.cancelReason') cancelReason, JSON_UNQUOTE(JSON_EXTRACT(p.metadata, '$.itemName')) itemName, COALESCE(JSON_UNQUOTE(JSON_EXTRACT(p.metadata, '$.itemType')), JSON_UNQUOTE(JSON_EXTRACT(p.metadata, '$.kind'))) itemType";

export const adminPaymentListSql = `SELECT ${columns} FROM payments p JOIN users u ON u.id = p.user_id ORDER BY p.status = 'created' DESC, p.created_at DESC LIMIT 200`;

// Dashboard queue: slips to check (oldest slip first), then cancelled payments whose refund is still due,
// then requests without a slip (newest first). Unpaid requests never expire, so abandoned ones must not
// push slips or refunds off the 50 rows; a member paying at the counter now finds their request on top.
export const adminPaymentQueueSql = `SELECT ${columns} FROM payments p JOIN users u ON u.id = p.user_id WHERE p.status = 'created' OR (p.status = 'cancelled' AND JSON_VALUE(p.metadata, '$.refund.status') = 'pending') ORDER BY CASE WHEN p.status = 'created' AND p.slip_uploaded_at IS NOT NULL THEN 0 WHEN p.status = 'cancelled' THEN 1 ELSE 2 END, p.slip_uploaded_at, p.created_at DESC LIMIT 50`;
