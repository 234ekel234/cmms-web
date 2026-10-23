"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import Breadcrumbs from "@/components/Breadcrumbs";
import ResetPasswordButton from "@/components/ResetPasswordButton";
import { useAuth } from "@/context/AuthContext";
import { canResetPassword } from "@/lib/rbac";

/**
 * One login: who they are, the sites they belong to and in what role, the
 * roster entry a technician's login is tied to, and what they have done lately.
 *
 * GET /users/:id already limits sites and activity to what the viewer shares —
 * a manager never sees which other companies someone works for, or what they
 * did there — so nothing here filters. Editing stays on the Users list.
 */

type UserDetail = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  employee: { id: string; name: string; position: string | null; archivedAt: string | null } | null;
  accounts: { id: string; name: string; role: string }[];
  /** Sites they belong to that the viewer does not manage — counted, not named. */
  otherSites?: number;
  activity: {
    id: string;
    action: string;
    description: string;
    createdAt: string;
    entityType: string | null;
    entityId: string | null;
    account: { id: string; name: string } | null;
  }[];
};

const ROLE_LABEL: Record<string, string> = {
  GENERAL_MANAGER: "General manager", MANAGER: "Manager", SUPERVISOR: "Supervisor",
  TECHNICIAN: "Technician", CLIENT: "Client",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export default function UserPage() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { user: me } = useAuth();

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/users/${userId}`)
      .then((res) => { if (!cancelled) setUser(res.data); })
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (!cancelled) setError(status === 404 ? "This user isn't on any of your sites." : "Couldn't load this user.");
      });
    return () => { cancelled = true; };
  }, [userId]);

  if (error) {
    return (
      <div className="tu-page">
        <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: "Not found" }]} />
        <div className="tu-error-banner" role="alert">{error}</div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="tu-page">
        <div className="tu-skeleton" style={{ height: 28, width: 220, marginBottom: 16 }} />
        <div className="tu-skeleton" style={{ height: 160 }} />
      </div>
    );
  }

  return (
    <div className="tu-page">
      <Breadcrumbs items={[{ label: "Users", href: "/users" }, { label: user.name }]} />

      <div className="tu-page-header">
        <div>
          <h1 className="tu-page-title">{user.name}</h1>
          <p className="tu-page-sub">{ROLE_LABEL[user.role] ?? user.role} · {user.email}</p>
        </div>
      </div>

      <div className="tu-person-grid">
        <section className="tu-card">
          <div className="tu-card-header"><h2 className="tu-card-title">Details</h2></div>
          <dl className="tu-person-facts">
            <div>
              <dt>Email</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{ROLE_LABEL[user.role] ?? user.role}</dd>
            </div>
            {user.employee && (
              <div>
                <dt>Employee record</dt>
                <dd>
                  <Link href={`/employees/${user.employee.id}`} className="tu-link">{user.employee.name}</Link>
                  {user.employee.position && <span className="tu-person-muted"> · {user.employee.position}</span>}
                  {user.employee.archivedAt && <span className="tu-person-muted"> · archived</span>}
                </dd>
              </div>
            )}
            <div>
              <dt>Login created</dt>
              <dd>{fmtDate(user.createdAt)}</dd>
            </div>
            {me && me.id !== user.id && canResetPassword(me.role, user.role) && (
              <div>
                <dt>Password</dt>
                <dd><ResetPasswordButton userId={user.id} name={user.name} /></dd>
              </div>
            )}
          </dl>
        </section>

        <section className="tu-card">
          <div className="tu-card-header"><h2 className="tu-card-title">Sites</h2></div>
          {user.accounts.length === 0 && !user.otherSites ? (
            <p className="tu-person-empty">
              {user.role === "GENERAL_MANAGER" ? "A general manager reaches every site." : "Not a member of any site yet."}
            </p>
          ) : user.accounts.length === 0 ? (
            <p className="tu-person-empty">
              Works on {user.otherSites} site{user.otherSites === 1 ? "" : "s"} you don&apos;t manage.
            </p>
          ) : (
            <ul role="list" className="tu-person-list">
              {user.accounts.map((a) => (
                <li key={a.id}>
                  <Link href={`/accounts/${a.id}/members`} className="tu-link">{a.name}</Link>
                  <span className="tu-person-muted"> · {ROLE_LABEL[a.role] ?? a.role}</span>
                </li>
              ))}
              {!!user.otherSites && (
                <li className="tu-person-muted">…and {user.otherSites} other site{user.otherSites === 1 ? "" : "s"} you don&apos;t manage</li>
              )}
            </ul>
          )}
        </section>
      </div>

      <section className="tu-card" style={{ marginTop: 24 }}>
        <div className="tu-card-header"><h2 className="tu-card-title">Recent activity</h2></div>
        {user.activity.length === 0 ? (
          <p className="tu-person-empty">Nothing recorded on your sites yet.</p>
        ) : (
          <ul role="list" className="tu-person-list">
            {user.activity.map((e) => (
              <li key={e.id}>
                {e.entityType === "WorkOrder" && e.entityId && e.account ? (
                  <Link href={`/accounts/${e.account.id}/work-orders/${e.entityId}#history`} className="tu-link">{e.description}</Link>
                ) : (
                  e.description
                )}
                <span className="tu-person-muted"> · {fmtWhen(e.createdAt)}{e.account ? ` · ${e.account.name}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
