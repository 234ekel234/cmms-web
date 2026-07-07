"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Landing for an account: staff get the Overview, clients (who can't see the
// Overview) keep going straight to their Work Orders.
export default function AccountRootPage() {
  const router = useRouter();
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const dest = user.role === "CLIENT" ? "work-orders" : "overview";
    router.replace(`/accounts/${accountId}/${dest}`);
  }, [user, accountId, router]);

  return <div className="p-8 text-sm text-gray-400">Loading…</div>;
}
