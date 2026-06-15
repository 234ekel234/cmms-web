"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Role = "GENERAL_MANAGER" | "MANAGER" | "SUPERVISOR" | "CLIENT";

type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  accountRole: Role;
  userAccountId: string;
};

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

const ROLE_LABELS: Record<Role, string> = {
  GENERAL_MANAGER: "General Manager",
  MANAGER: "Manager",
  SUPERVISOR: "Supervisor",
  CLIENT: "Client",
};

const ROLE_CLS: Record<Role, string> = {
  GENERAL_MANAGER: "bg-violet-50 text-violet-700",
  MANAGER:         "bg-blue-50 text-blue-700",
  SUPERVISOR:      "bg-green-50 text-green-700",
  CLIENT:          "bg-amber-50 text-amber-700",
};

export default function MembersPage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assigningRole, setAssigningRole] = useState<Role>("SUPERVISOR");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const isManager = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => { fetchData(); }, [accountId]);

  async function fetchData() {
    try {
      const [membersRes, usersRes] = await Promise.all([
        api.get(`/accounts/${accountId}/members`),
        api.get("/users").catch(() => ({ data: [] })),
      ]);
      setMembers(membersRes.data);
      setAllUsers(usersRes.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  const memberIds = new Set(members.map((m) => m.id));
  const filteredUsers = allUsers.filter(
    (u) =>
      !memberIds.has(u.id) &&
      (search.trim() === "" ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()))
  );

  async function assign(userId: string) {
    setSavingId(userId);
    try {
      const res = await api.post(`/accounts/${accountId}/members`, { userId, role: assigningRole });
      setMembers((prev) => [...prev, res.data]);
      setSearch("");
    } catch {
      // silent
    } finally {
      setSavingId(null);
    }
  }

  async function remove(member: Member) {
    setRemovingId(member.id);
    try {
      await api.delete(`/accounts/${accountId}/members/${member.id}`);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch {
      // silent
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h2 className="text-lg font-bold text-gray-900 mb-6">Members</h2>

      {/* Current members */}
      <div className="mb-8">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Current Members</p>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 bg-white rounded-xl border border-gray-100 animate-pulse" />)}
          </div>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-400">No members yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-5 py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 text-sm">{m.name}</p>
                  <p className="text-xs text-gray-400">{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_CLS[m.accountRole] ?? "bg-gray-100 text-gray-600"}`}>
                    {ROLE_LABELS[m.accountRole]}
                  </span>
                  {isManager && (
                    <button
                      onClick={() => remove(m)}
                      disabled={removingId === m.id}
                      className="text-xs text-red-400 hover:text-red-600 cursor-pointer disabled:opacity-50"
                    >
                      {removingId === m.id ? "..." : "✕"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add members */}
      {isManager && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Add Member</p>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 mb-2">Assign as</label>
              <div className="flex gap-2 flex-wrap">
                {(["SUPERVISOR", "CLIENT", "MANAGER"] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setAssigningRole(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                      assigningRole === r ? "bg-[#2166AC] text-white border-[#2166AC]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Search Users</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC] mb-3"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email"
              />
              {search.length > 0 && filteredUsers.length === 0 ? (
                <p className="text-sm text-gray-400">No users found.</p>
              ) : (
                search.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {filteredUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between border border-gray-100 rounded-xl px-4 py-2.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                        <button
                          onClick={() => assign(u.id)}
                          disabled={savingId === u.id}
                          className="bg-[#2166AC] text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-[#1a5490] cursor-pointer disabled:opacity-50"
                        >
                          {savingId === u.id ? "..." : "+ Add"}
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
