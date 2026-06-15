"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = email.trim() !== "" && password !== "" && !loading;

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password,
      });
      const { token, user } = res.data;
      saveSession(token, user);
      router.push("/");
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — brand panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#2166AC] flex-col items-center justify-center p-12 gap-6">
        <div className="bg-white rounded-2xl px-10 py-6 shadow-xl">
          <p className="text-[#2166AC] text-4xl font-black tracking-tight">CMMS</p>
        </div>
        <div className="text-center">
          <p className="text-white text-3xl font-bold">Maintenance Management</p>
          <p className="text-white/70 text-base mt-2">Track assets, work orders, and PM checklists — all in one place.</p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4 w-full max-w-sm">
          {[
            { label: "Work Orders", desc: "Raise and resolve maintenance requests" },
            { label: "Assets", desc: "Monitor equipment health and history" },
            { label: "PM Checklists", desc: "Schedule and track preventive maintenance" },
            { label: "Reports", desc: "Performance insights across all sites" },
          ].map((f) => (
            <div key={f.label} className="bg-white/10 rounded-xl p-4">
              <p className="text-white font-semibold text-sm">{f.label}</p>
              <p className="text-white/60 text-xs mt-1">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form panel */}
      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="bg-[#2166AC] rounded-xl px-6 py-3 mb-3">
              <p className="text-white text-2xl font-black tracking-tight">CMMS</p>
            </div>
            <p className="text-gray-500 text-sm">Maintenance Management System</p>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">Sign in</h1>
          <p className="text-gray-500 text-sm mb-8">Enter your credentials to continue.</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium rounded-lg px-4 py-3 mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
                className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2166AC] focus:border-transparent disabled:opacity-50 transition"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 pr-16 text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#2166AC] focus:border-transparent disabled:opacity-50 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#2166AC] hover:text-blue-800"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#2166AC] hover:bg-blue-800 disabled:opacity-50 text-white font-semibold rounded-lg py-3 text-sm transition cursor-pointer disabled:cursor-not-allowed mt-1"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-400 mt-10">
            Powered by <span className="font-semibold text-gray-500">ServiceMaster</span>
          </p>
        </div>
      </div>
    </div>
  );
}
