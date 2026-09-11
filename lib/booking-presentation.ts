type BookingTime = { status: string; startsAt?: string; starts_at?: string };

export function upcomingBooking(booking: BookingTime, now = Date.now()) {
  return ["hold", "pending_payment", "paid"].includes(booking.status)
    && new Date(booking.startsAt || booking.starts_at || "").getTime() >= now;
}

export function bookingStatusLabel(status: string) {
  const labels: Record<string, string> = {
    hold: "กันสนาม", pending_payment: "รอชำระเงิน", paid: "ชำระแล้ว", checked_in: "เข้าใช้แล้ว",
    cancelled: "ยกเลิกแล้ว", expired: "หมดอายุ", done: "ใช้บริการแล้ว", completed: "ใช้บริการแล้ว", used: "ใช้บริการแล้ว",
  };
  return labels[status] || "ตรวจสอบสถานะ";
}
