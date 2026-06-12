import { redirect } from "next/navigation";

import { getCurrentProfile } from "@/lib/auth/profile";
import { listMembers } from "@/lib/auth/admin-actions";
import { MemberManager } from "@/components/account-management/member-manager";

export const dynamic = "force-dynamic";

export default async function AccountManagementPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/?auth=login");
  }
  if (profile.role !== "admin" || profile.status !== "active") {
    redirect("/dashboard");
  }

  const members = await listMembers();

  return <MemberManager initialMembers={members} currentAdminId={profile.id} />;
}
