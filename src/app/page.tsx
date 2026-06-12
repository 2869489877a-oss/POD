import { fetchDashboardStats } from "@/lib/actions/dashboard";
import { HomeHub } from "@/components/home-hub";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stats = await fetchDashboardStats();

  return <HomeHub stats={stats} />;
}
