import { Mail, Lock, Eye, EyeOff, Shield, Clock, Users, BarChart3, ChevronRight } from "lucide-react";
import { useState } from "react";

const features = [
  { icon: Clock,     title: "Real-time Attendance",  desc: "Live biometric tracking across all branches" },
  { icon: Users,     title: "Employee Management",   desc: "Manage staff records, shifts and payroll"    },
  { icon: BarChart3, title: "Smart Analytics",        desc: "Reports and insights at your fingertips"    },
];

const stats = [
  { value: "48", label: "Branches" },
  { value: "2.4k", label: "Employees" },
  { value: "99.9%", label: "Uptime" },
];

export function ElegantSplit() {
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="min-h-screen flex font-['Inter']" style={{ background: "#f0f2f5" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .slp-input {
          width: 100%; padding: 0.75rem 1rem 0.75rem 2.75rem;
          background: #f8fafc; border: 1.5px solid #e2e8f0;
          border-radius: 0.75rem; font-size: 0.875rem; color: #0f172a;
          outline: none; transition: all 0.2s; font-family: inherit;
        }
        .slp-input:focus { border-color: #cc1f2a; background: #fff; box-shadow: 0 0 0 3px rgba(204,31,42,0.1); }
        .slp-btn {
          width: 100%; padding: 0.875rem; border-radius: 0.875rem;
          font-size: 0.9375rem; font-weight: 700; color: #fff; border: none;
          cursor: pointer; font-family: inherit; letter-spacing: 0.01em;
          background: linear-gradient(135deg, #cc1f2a, #a31620);
          box-shadow: 0 4px 20px rgba(204,31,42,0.35);
          transition: all 0.2s;
        }
        .slp-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 28px rgba(204,31,42,0.45); }
        .hex-pattern {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }
      `}</style>

      {/* LEFT — deep branding panel */}
      <div className="hidden lg:flex lg:w-[52%] flex-col relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #0d1b2a 0%, #1a0a0f 60%, #200d10 100%)" }}>

        <div className="hex-pattern absolute inset-0" />

        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1"
          style={{ background: "linear-gradient(90deg, #cc1f2a, #e05a62, #cc1f2a)" }} />

        {/* Glow orbs */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #cc1f2a, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #c084fc, transparent 70%)" }} />

        <div className="relative z-10 flex flex-col h-full px-12 py-10">
          {/* Brand */}
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="absolute inset-0 rounded-xl blur-sm opacity-60"
                style={{ background: "#cc1f2a" }} />
              <div className="relative w-12 h-12 rounded-xl flex items-center justify-center bg-white p-1">
                <img src="/__mockup/images/srilanka-post-logo.png" alt="SLP" className="w-full h-full object-contain" />
              </div>
            </div>
            <div>
              <p className="font-bold text-white text-[15px] leading-none tracking-tight">Sri Lanka Post</p>
              <p className="text-white/40 text-[11px] mt-1 tracking-wider uppercase">Colombo District</p>
            </div>
          </div>

          {/* Hero */}
          <div className="mt-auto mb-12">
            <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full"
              style={{ background: "rgba(204,31,42,0.15)", border: "1px solid rgba(204,31,42,0.3)" }}>
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-[11px] text-white/70 font-medium">All systems operational</span>
            </div>

            <h1 className="text-[42px] font-extrabold leading-[1.1] tracking-tight">
              <span className="text-white">Workforce</span><br />
              <span style={{ color: "#e05a62" }}>Intelligence</span><br />
              <span className="text-white">Platform</span>
            </h1>

            <p className="mt-5 text-white/40 text-sm leading-relaxed max-w-[300px]">
              Unified attendance, HR, and payroll management for Sri Lanka Post — Colombo District.
            </p>

            {/* Stats row */}
            <div className="mt-8 flex gap-6">
              {stats.map((s, i) => (
                <div key={i} className="text-center">
                  <p className="text-2xl font-bold text-white">{s.value}</p>
                  <p className="text-[11px] text-white/35 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Divider */}
            <div className="mt-8 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

            {/* Features */}
            <div className="mt-6 space-y-3.5">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-3 group cursor-default">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all"
                    style={{ background: "rgba(204,31,42,0.12)", border: "1px solid rgba(204,31,42,0.2)" }}>
                    <f.icon className="w-3.5 h-3.5" style={{ color: "#e05a62" }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-white text-xs font-semibold leading-none">{f.title}</p>
                    <p className="text-white/35 text-[10px] mt-0.5">{f.desc}</p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-white/15 group-hover:text-white/30 transition-colors" />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-white/20 text-[10px]">
            <Shield className="w-3 h-3" />
            <span>Enterprise-grade security • AES-256 encrypted • ZKTeco biometrics</span>
          </div>
        </div>
      </div>

      {/* RIGHT — login form */}
      <div className="flex-1 flex items-center justify-center p-8"
        style={{ background: "linear-gradient(160deg, #f8f9fb 0%, #edf0f5 100%)" }}>
        <div className="w-full max-w-[360px]">

          {/* Mobile brand */}
          <div className="flex lg:hidden items-center gap-3 mb-8 justify-center">
            <img src="/__mockup/images/srilanka-post-logo.png" alt="SLP"
              className="w-10 h-10 rounded-xl bg-white p-1 object-contain shadow-sm" />
            <p className="font-bold text-gray-900">Sri Lanka Post</p>
          </div>

          {/* Card */}
          <div className="bg-white rounded-2xl p-8 shadow-2xl shadow-black/10 border border-gray-100">

            {/* Header */}
            <div className="mb-7">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: "linear-gradient(135deg, #cc1f2a, #a31620)" }}>
                <Shield className="w-5 h-5 text-white" />
              </div>
              <h2 className="text-[22px] font-bold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-gray-400 text-[13px] mt-1">Sri Lanka Post · Colombo District</p>
            </div>

            {/* Form */}
            <form className="space-y-4">
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Username</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="slp-input" placeholder="Enter your username" />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type={showPw ? "text" : "password"} className="slp-input" style={{ paddingRight: "2.75rem" }} placeholder="Enter password" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button type="button" className="slp-btn">Sign In to Dashboard</button>
              </div>
            </form>

            {/* Footer */}
            <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-center gap-1.5">
              <img src="/__mockup/images/liveu-logo.png" alt="LiveU" className="h-4 w-auto object-contain" />
              <p className="text-[11px] text-gray-400">Powered by <span className="font-semibold text-gray-500">Live U Pvt Ltd</span></p>
            </div>
          </div>

          <p className="text-center text-[11px] text-gray-400 mt-4">Sri Lanka Post · Colombo © 2026</p>
        </div>
      </div>
    </div>
  );
}
