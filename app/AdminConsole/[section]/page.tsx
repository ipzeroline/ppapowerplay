import { notFound } from "next/navigation";
import { AdminConsolePageView, adminConsoleSections, type AdminConsoleSection } from "../page";

type AdminConsoleSectionPageProps = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ key?: string | string[]; report?: string | string[] }>;
};

export default async function AdminConsoleSectionPage({ params, searchParams }: AdminConsoleSectionPageProps) {
  const { section } = await params;
  if (!isAdminConsoleSection(section) || section === "dashboard") notFound();
  return AdminConsolePageView({ searchParams, initialTab: section });
}

function isAdminConsoleSection(value: string): value is AdminConsoleSection {
  return adminConsoleSections.includes(value as AdminConsoleSection);
}
