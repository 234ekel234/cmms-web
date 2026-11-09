"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Landing for a site: staff get the Overview (the site at a glance), and clients
// and technicians go straight to Work Orders — the Overview is a site-wide
// summary neither of them reads. Site Access (members) is under More.
export default function AccountRootPage() {
  const router = useRouter();
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let dest = "overview";
    if (user.role === "CLIENT" || user.role === "TECHNICIAN") dest = "work-orders";
    router.replace(`/accounts/${accountId}/${dest}`);
  }, [user, accountId, router]);

  return <div className="px-4 py-5 sm:p-8 text-sm text-[var(--tu-text-subtle)]">Loading…</div>;
}
