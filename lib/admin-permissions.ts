export const sectionPermissions: Record<string, string> = {
  dashboard: "dashboard.view", members: "members.manage", staff: "staff.manage", roles: "roles.manage",
  reports: "reports.view", content: "content.manage", coupons: "coupons.manage", bookings: "bookings.manage",
  trainers: "trainers.manage", audit: "settings.manage", security: "settings.manage", system: "settings.manage", analysis: "settings.manage",
};

export function canAccessSection(section: string, can: (permission: string) => boolean) {
  return section === "scanner" ? ["bookings.manage", "coupons.manage", "payments.manage"].some(can) : Boolean(sectionPermissions[section] && can(sectionPermissions[section]));
}
