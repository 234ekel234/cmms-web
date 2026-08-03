"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
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
      router.push("/accounts");
    } catch (err) {
      setError((isAxiosError(err) && err.response?.data?.error) || "Incorrect email or password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tu-login">
      {/* Left — brand panel */}
      <div className="tu-login-brand">
        <div className="tu-login-logo-card">
          {/* eslint-disable @next/next/no-img-element */}
          <img src="/fmi_logo_dark.png" alt="FMI" className="h-14 w-auto object-contain" />
          <div className="tu-login-logo-rule" />
          <img src="/logo_with_label_dark.png" alt="ServiceMaster" className="h-8 w-auto object-contain" />
          {/* eslint-enable @next/next/no-img-element */}
        </div>
        <div className="text-center">
          <p className="tu-login-headline">Maintenance Management</p>
          <p className="tu-login-sub">Track assets, work orders, and PM checklists — all in one place.</p>
        </div>
        <div className="tu-login-features">
          {[
            { label: "Work Orders", desc: "Raise and resolve maintenance requests" },
            { label: "Assets", desc: "Monitor equipment health and history" },
            { label: "PM Checklists", desc: "Schedule and track preventive maintenance" },
            { label: "Reports", desc: "Performance insights across all sites" },
          ].map((f) => (
            <div key={f.label} className="tu-login-feature">
              <p className="tu-login-feature-name">{f.label}</p>
              <p className="tu-login-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right — form panel */}
      <div className="tu-login-form-panel">
        <div className="tu-login-form">
          {/* Mobile logo */}
          <div className="tu-login-mobile-logos lg:hidden flex flex-col items-center mb-8 gap-3">
            {/* eslint-disable @next/next/no-img-element */}
            <img src="/fmi_logo_dark.png" alt="FMI" className="tu-mark-fmi h-10 w-auto object-contain" />
            <img src="/logo_with_label_dark.png" alt="ServiceMaster" className="tu-mark-sm h-7 w-auto object-contain" />
            {/* eslint-enable @next/next/no-img-element */}
          </div>

          <h1 className="tu-login-title">Sign in</h1>
          <p className="tu-login-lead">Enter your credentials to continue.</p>

          {error && (
            <div className="tu-login-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <div>
              <label className="tu-login-label">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
                className="tu-login-input"
              />
            </div>

            <div>
              <label className="tu-login-label">
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
                  className="tu-login-input" style={{ paddingRight: 64 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="tu-login-reveal"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="tu-login-submit"
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="tu-login-footer-mark flex justify-center mt-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo_with_label_dark.png" alt="ServiceMaster" className="tu-mark-sm h-6 w-auto object-contain opacity-60" />
          </div>
        </div>
      </div>
    </div>
  );
}
