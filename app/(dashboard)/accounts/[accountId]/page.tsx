"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Landing for an account: managers get Members, supervisors (who can't open
// Members) get the Overview, and clients keep going straight to Work Orders.
export default function AccountRootPage() {
  const router = useRouter();
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let dest = "overview";
    if (user.role === "CLIENT") dest = "work-orders";
    else if (user.role === "GENERAL_MANAGER" || user.role === "MANAGER") dest = "members";
    router.replace(`/accounts/${accountId}/${dest}`);
  }, [user, accountId, router]);

  return <div className="p-8 text-sm text-gray-400">Loading…</div>;
}
