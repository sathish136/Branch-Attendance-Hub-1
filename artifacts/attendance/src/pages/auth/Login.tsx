import { useState } from "react";
import { useLocation } from "wouter";
import { Card, Input, Label, Button } from "@/components/ui";
import { Mail, Lock, Fingerprint, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.message || "Invalid username or password.");
        return;
      }
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
      setLocation("/");
    } catch {
      setError("Unable to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-primary/20 rounded-full blur-3xl" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl" />

      <Card className="w-full max-w-md p-8 shadow-2xl relative z-10 border-0 bg-white/95 backdrop-blur-xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-primary/30 mb-4 transform rotate-3">
            <Fingerprint className="w-8 h-8 text-white -rotate-3" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">PostHRMS Login</h1>
          <p className="text-sm text-gray-500 mt-2">Sign in to manage attendance and workforce</p>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-gray-700">Username or Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                required
                placeholder="admin"
                className="pl-10 py-2.5 bg-gray-50"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-gray-700">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                required
                type="password"
                placeholder="••••••••"
                className="pl-10 py-2.5 bg-gray-50"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button type="submit" className="w-full py-2.5 text-base mt-2 shadow-lg shadow-primary/25" disabled={loading}>
            {loading ? "Authenticating…" : "Sign In to Dashboard"}
          </Button>
        </form>

        <div className="mt-8 text-center text-xs text-gray-400">
          <p>Secure Enterprise Portal • ZKTeco Integrated</p>
        </div>
      </Card>
    </div>
  );
}
