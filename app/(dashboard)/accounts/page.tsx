"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type Account = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

export default function AccountsPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shiftName, setShiftName] = useState("Day Shift");
  const [shiftStart, setShiftStart] = useState("08:00");
  const [shiftEnd, setShiftEnd] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const canCreate = user?.role === "GENERAL_MANAGER" || user?.role === "MANAGER";

  useEffect(() => {
    fetchAccounts();
  }, []);

  async function fetchAccounts() {
    setLoading(true);
    setError(false);
    try {
      const res = await api.get("/accounts");
      setAccounts(res.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function createAccount() {
    if (!name.trim()) { setFormError("Account name is required."); return; }
    if (!shiftName.trim()) { setFormError("Shift name is required."); return; }
    setFormError("");
    setSaving(true);
    try {
      const res = await api.post("/accounts", {
        name: name.trim(),
        description: description.trim() || null,
        shifts: [{ name: shiftName.trim(), startTime: shiftStart, endTime: shiftEnd }],
      });
      setAccounts((prev) => [res.data, ...prev]);
      setShowForm(false);
      setName("");
      setDescription("");
      setShiftName("Day Shift");
      setShiftStart("08:00");
      setShiftEnd("17:00");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setFormError(e?.response?.data?.error ?? "Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-gray-400 text-sm mt-0.5">All maintenance accounts</p>
        </div>
        {canCreate && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#2166AC] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1a5490] transition-colors cursor-pointer"
          >
            + New Account
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">New Account</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Account Name *</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Building"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 mb-3">First Shift Template</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Shift Name</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                    value={shiftName}
                    onChange={(e) => setShiftName(e.target.value)}
                    placeholder="Day Shift"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Time</label>
                  <input
                    type="time"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2166AC]"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                  />
                </div>
              </div>
            </div>
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowForm(false); setFormError(""); }}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={createAccount}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-[#2166AC] rounded-lg hover:bg-[#1a5490] disabled:opacity-50 cursor-pointer"
              >
                {saving ? "Creating..." : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-6">
          Failed to load accounts. Try refreshing.
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center text-gray-400 text-sm">
            No accounts found.{" "}
            {canCreate && (
              <button onClick={() => setShowForm(true)} className="text-[#2166AC] font-semibold hover:underline cursor-pointer">
                Create the first one.
              </button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-400 font-semibold uppercase tracking-wide">
                <th className="px-6 py-3 text-left">Account Name</th>
                <th className="px-6 py-3 text-left">Description</th>
                <th className="px-6 py-3 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      href={`/accounts/${acc.id}/work-orders`}
                      className="font-semibold text-gray-800 hover:text-[#2166AC] transition-colors"
                    >
                      {acc.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-gray-500">{acc.description ?? "—"}</td>
                  <td className="px-6 py-4 text-gray-400 text-xs">
                    {new Date(acc.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
