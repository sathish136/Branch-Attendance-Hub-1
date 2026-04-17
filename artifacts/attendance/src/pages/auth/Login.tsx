import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Mail, Lock, AlertCircle, Shield, Clock, Users, BarChart3, Eye, EyeOff } from "lucide-react";
const liveuLogo = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQCzrc0k5wmNzmItazY38yj1_7K5zAFLMxn-Q&s";
const sriLankaPostLogo = "https://upload.wikimedia.org/wikipedia/en/c/c1/Sri_Lanka_Post_logo.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const features = [
  { icon: Clock,    title: "Real-time Attendance",  desc: "Live biometric tracking across all branches" },
  { icon: Users,    title: "Employee Management",    desc: "Manage staff records, shifts and payroll"    },
  { icon: BarChart3,title: "Smart Analytics",         desc: "Reports and insights at your fingertips"     },
];

export default function Login() {
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

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
    <>
      <style>{`
        @keyframes float1 { 0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-28px) scale(1.04)} }
        @keyframes float2 { 0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(22px) scale(0.96)} }
        @keyframes float3 { 0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-16px) rotate(6deg)} }
        @keyframes pulse-ring { 0%{transform:scale(0.9);opacity:.6}70%{transform:scale(1.15);opacity:0}100%{transform:scale(0.9);opacity:0} }
        @keyframes slide-up  { from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)} }
        @keyframes slide-right{ from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)} }
        @keyframes spin-slow { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes blob { 0%,100%{border-radius:60% 40% 70% 30%/50% 60% 40% 60%}33%{border-radius:30% 70% 40% 60%/60% 30% 70% 40%}66%{border-radius:70% 30% 60% 40%/30% 70% 30% 70%} }
        @keyframes shimmer { 0%{opacity:.4}50%{opacity:.8}100%{opacity:.4} }
        @keyframes count-in { from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)} }
        .anim-float1 { animation: float1 6s ease-in-out infinite; }
        .anim-float2 { animation: float2 8s ease-in-out infinite; }
        .anim-float3 { animation: float3 5s ease-in-out infinite; }
        .anim-pulse-ring { animation: pulse-ring 2.5s ease-out infinite; }
        .anim-spin { animation: spin-slow 18s linear infinite; }
        .anim-blob { animation: blob 8s ease-in-out infinite; }
        .anim-shimmer { animation: shimmer 3s ease-in-out infinite; }
        .panel-left  { animation: slide-up 0.7s cubic-bezier(.22,1,.36,1) both; }
        .panel-right { animation: slide-right 0.7s 0.15s cubic-bezier(.22,1,.36,1) both; }
        .feature-row:nth-child(1){ animation: count-in .5s .4s both }
        .feature-row:nth-child(2){ animation: count-in .5s .55s both }
        .feature-row:nth-child(3){ animation: count-in .5s .7s both }
        .form-row:nth-child(1){ animation: count-in .45s .3s both }
        .form-row:nth-child(2){ animation: count-in .45s .42s both }
        .form-row:nth-child(3){ animation: count-in .45s .54s both }
        .input-mod {
          width:100%; padding:.625rem .875rem .625rem 2.6rem;
          background:#f8faf8; border:1.5px solid #e4ebe4;
          border-radius:.75rem; font-size:.875rem; color:#1a2e1a;
          outline:none; transition: border-color .2s, box-shadow .2s, background .2s;
        }
        .input-mod:focus {
          border-color:hsl(119 41% 54%); background:#fff;
          box-shadow:0 0 0 3px hsl(119 41% 54% / .15);
        }
        .btn-primary {
          width:100%; padding:.75rem; border-radius:.875rem; font-size:.9375rem;
          font-weight:600; color:#fff; border:none; cursor:pointer;
          background: linear-gradient(135deg,hsl(119 41% 50%),hsl(130 50% 42%));
          box-shadow: 0 4px 18px hsl(119 41% 54% / .4);
          transition: opacity .2s, transform .15s, box-shadow .2s;
          position:relative; overflow:hidden;
        }
        .btn-primary:hover:not(:disabled){ opacity:.92; transform:translateY(-1px); box-shadow:0 6px 24px hsl(119 41% 54% / .5); }
        .btn-primary:active:not(:disabled){ transform:translateY(0); }
        .btn-primary:disabled{ opacity:.7; cursor:not-allowed; }
        .btn-primary::after { content:''; position:absolute; inset:0;
          background:linear-gradient(135deg,rgba(255,255,255,.15),transparent);
          border-radius:inherit; }
      `}</style>

      <div className="min-h-screen flex overflow-hidden" style={{ background: "hsl(220 30% 10%)" }}>

        {/* ── LEFT PANEL — branding & animations ── */}
        <div className={`hidden lg:flex lg:w-[55%] flex-col relative overflow-hidden ${mounted ? "panel-left" : "opacity-0"}`}
          style={{ background: "linear-gradient(145deg, hsl(220 30% 11%) 0%, hsl(220 35% 8%) 100%)" }}>

          {/* Animated blobs */}
          <div className="anim-blob absolute w-[480px] h-[480px] -top-24 -left-24 opacity-[.08]"
            style={{ background: "hsl(119 41% 54%)", filter: "blur(2px)" }} />
          <div className="anim-blob absolute w-[360px] h-[360px] bottom-0 right-0 opacity-[.06]"
            style={{ background: "hsl(210 80% 60%)", animationDelay: "-4s", filter: "blur(2px)" }} />

          {/* Floating circles */}
          <div className="anim-float1 absolute top-[15%] right-[12%] w-28 h-28 rounded-full border border-white/8"
            style={{ background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,.06), transparent)" }} />
          <div className="anim-float2 absolute bottom-[20%] left-[8%] w-20 h-20 rounded-full border border-white/6"
            style={{ background: "radial-gradient(circle at 30% 30%, rgba(93,183,92,.08), transparent)" }} />
          <div className="anim-float3 absolute top-[55%] right-[22%] w-12 h-12 rounded-full"
            style={{ background: "hsl(119 41% 54% / .12)", border: "1px solid hsl(119 41% 54% / .2)" }} />

          {/* Spinning ring */}
          <div className="anim-spin absolute top-[30%] left-[5%] w-40 h-40 rounded-full opacity-10"
            style={{ border: "1.5px dashed hsl(119 41% 54%)" }} />

          {/* Grid dots pattern */}
          <div className="absolute inset-0 opacity-[.03]"
            style={{backgroundImage:"radial-gradient(circle, rgba(255,255,255,.8) 1px, transparent 1px)", backgroundSize:"32px 32px"}} />

          {/* Content */}
          <div className="relative z-10 flex flex-col h-full px-12 py-10">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="anim-pulse-ring absolute inset-0 rounded-full"
                  style={{ background: "hsl(119 41% 54% / .4)" }} />
                <img src={sriLankaPostLogo} alt="Sri Lanka Post" className="w-12 h-12 rounded-full relative object-cover"
                  style={{ boxShadow: "0 0 20px hsl(119 41% 54% / .5)" }} />
              </div>
              <div>
                <p className="font-bold text-white text-base tracking-tight leading-none">PostHRMS</p>
                <p className="text-white/40 text-[11px] mt-0.5">Sri Lanka Post · Colombo District</p>
              </div>
            </div>

            {/* Hero text */}
            <div className="mt-auto mb-10">
              <div className="anim-shimmer inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" style={{ boxShadow: "0 0 6px #4ade80" }} />
                <span className="text-white/60 text-[11px] font-medium">System Operational</span>
              </div>
              <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
                Workforce<br />
                <span style={{ color: "hsl(119 41% 60%)" }}>Intelligence</span><br />
                Platform
              </h1>
              <p className="mt-4 text-white/45 text-[14px] leading-relaxed max-w-xs">
                Unified attendance, HR, and payroll management for Sri Lanka Post — Colombo District offices, powered by ZKTeco biometrics.
              </p>

              {/* Feature list */}
              <div className="mt-8 space-y-4">
                {features.map((f, i) => (
                  <div key={i} className="feature-row flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: "hsl(119 41% 54% / .15)", border: "1px solid hsl(119 41% 54% / .2)" }}>
                      <f.icon className="w-4 h-4" style={{ color: "hsl(119 41% 65%)" }} />
                    </div>
                    <div>
                      <p className="text-white text-[13px] font-semibold leading-none">{f.title}</p>
                      <p className="text-white/40 text-[11px] mt-0.5">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center gap-2 text-white/25 text-[11px]">
              <Shield className="w-3 h-3" />
              <span>Enterprise-grade security • AES-256 encrypted</span>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — login form ── */}
        <div className={`flex-1 flex items-center justify-center p-8 ${mounted ? "panel-right" : "opacity-0"}`}
          style={{ background: "#f0f4f0" }}>

          <div className="w-full max-w-sm">

            {/* Mobile brand */}
            <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
              <img src={sriLankaPostLogo} alt="Sri Lanka Post" className="w-10 h-10 rounded-full object-cover"
                style={{ boxShadow: "0 2px 10px hsl(119 41% 54% / .4)" }} />
              <p className="font-bold text-gray-900 text-lg">PostHRMS</p>
            </div>

            {/* Form card */}
            <div className="bg-white rounded-2xl shadow-xl shadow-black/8 p-8 border border-gray-100/80">
              <div className="mb-7">
                <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">Welcome back</h2>
                <p className="text-gray-400 text-sm mt-1">Sri Lanka Post · Colombo District</p>
                <p className="text-gray-400 text-xs mt-0.5">Sign in to access your dashboard</p>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-2.5 text-sm px-3.5 py-3 rounded-xl"
                  style={{ background: "#fef2f2", border: "1.5px solid #fecaca", color: "#b91c1c" }}>
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                {/* Username */}
                <div className="form-row space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-600">Username or Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      required
                      className="input-mod"
                      placeholder="Enter username"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      autoComplete="username"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="form-row space-y-1.5">
                  <label className="text-[13px] font-semibold text-gray-600">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      className="input-mod"
                      style={{ paddingRight: "2.5rem" }}
                      placeholder="Enter password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <div className="form-row pt-1">
                  <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                        </svg>
                        Authenticating…
                      </span>
                    ) : "Sign In to Dashboard"}
                  </button>
                </div>
              </form>

              <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center gap-2">
                <img src={liveuLogo} alt="Live U (Pvt) Ltd" className="w-5 h-5 rounded-full object-cover" />
                <p className="text-[11px] text-gray-400">Powered by <span className="font-semibold text-gray-500">Live U (Pvt) Ltd</span> · ZKTeco Integrated</p>
              </div>
            </div>

            {/* Bottom note */}
            <p className="text-center text-[11px] text-gray-400 mt-5">
              Sri Lanka Post · Colombo District © {new Date().getFullYear()} · PostHRMS v2.0
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
