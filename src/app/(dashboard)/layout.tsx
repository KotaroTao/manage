import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import MainLayout from "@/components/layout/main-layout";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return <MainLayout>{children}</MainLayout>;
}
