"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Use server-side API to handle signup + org creation atomically
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, orgName }),
    });

    const result = await res.json();

    if (!res.ok) {
      // Show a generic error message to avoid leaking detailed backend errors
      setError(
        typeof result.error === "string"
          ? result.error
          : "Signup failed. Please check your details and try again.",
      );
      setLoading(false);
      return;
    }

    // Sign in with the new credentials after server-side signup
    const supabase = createClient();
    const { error: loginErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (loginErr) {
      setError(loginErr.message);
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="bg-mesh min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md fade-in">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "linear-gradient(135deg, #7c5cfc, #22d3a8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 16px",
              fontSize: 22,
            }}
          >
            🤖
          </div>
          <h1
            className="grad-text"
            style={{
              fontSize: "1.75rem",
              fontWeight: 800,
              letterSpacing: "-0.03em",
            }}
          >
            Get started free
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              marginTop: 6,
              fontSize: "0.875rem",
            }}
          >
            Create your AI Assistant workspace
          </p>
        </div>

        <div
          className="glass-strong"
          style={{ borderRadius: 20, padding: "32px" }}
        >
          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 18 }}
          >
            <div>
              <label className="label">Workspace / Organization name</label>
              <input
                type="text"
                required
                placeholder="e.g. Acme Corp or My Workspace"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="input"
              />
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  marginTop: 5,
                }}
              >
                This is your team or personal workspace name — it can be
                anything.
              </p>
            </div>

            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>

            {error && <div className="alert-error">⚠ {error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{ marginTop: 4 }}
            >
              {loading && <span className="spinner" />}
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p
            style={{
              textAlign: "center",
              marginTop: 20,
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
            }}
          >
            Already have an account?{" "}
            <Link
              href="/login"
              style={{
                color: "var(--accent)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
