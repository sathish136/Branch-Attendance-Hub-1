import { Mail, Lock, Eye, EyeOff, ShieldCheck, Clock, Users, BarChart3 } from "lucide-react";
import { useState } from "react";

const features = [
  { icon: Clock,     label: "Real-time Attendance" },
  { icon: Users,     label: "HR Management" },
  { icon: BarChart3, label: "Smart Analytics" },
];

export function MinimalCard() {
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center font-['Inter'] px-4"
      style={{ background: "#f5f5f7" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .mc-input {
          width: 100%; padding: 0.75rem 1rem 0.75rem 2.75rem;
          background: #fff; border: 1.5px solid #e5e7eb;
          border-radius: 0.625rem; font-size: 0.875rem; color: #111827;
          outline: none; transition: all 0.2s; font-family: inherit;
        }
        .mc-input:focus { border-color: #cc1f2a; box-shadow: 0 0 0 3px rgba(204,31,42,0.08); }
        .mc-btn {
          width: 100%; padding: 0.8rem; border-radius: 0.625rem;
          font-size: 0.9375rem; font-weight: 600; color: #fff; border: none;
          cursor: pointer; font-family: inherit;
          background: #cc1f2a; transition: all 0.2s;
        }
        .mc-btn:hover { background: #b01a24; transform: translateY(-1px); box-shadow: 0 4px 18px rgba(204,31,42,0.3); }
      `}</style>

      <div className="w-full max-w-[400px]">

        {/* Top brand strip */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <img src="/__mockup/images/srilanka-post-logo.png" alt="SLP"
            className="w-9 h-9 rounded-lg bg-white p-0.5 object-contain"
            style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }} />
          <div>
            <p className="font-semibold text-gray-900 text-[14px] leading-none">Sri Lanka Post</p>
            <p className="text-gray-400 text-[11px] mt-0.5">Colombo District</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl overflow-hidden shadow-xl shadow-black/8">

          {/* Red top accent */}
          <div className="h-1.5" style={{ background: "linear-gradient(90deg, #cc1f2a 0%, #e05a62 50%, #cc1f2a 100%)" }} />

          <div className="p-8">
            <div className="mb-7">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-gray-400 text-sm mt-1.5">Sign in to access the attendance portal</p>
            </div>

            <form className="space-y-4">
              <div>
                <label className="block text-[12.5px] font-medium text-gray-600 mb-1.5">Username</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className="mc-input" placeholder="Enter your username" />
                </div>
              </div>
              <div>
                <label className="block text-[12.5px] font-medium text-gray-600 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type={showPw ? "text" : "password"} className="mc-input" style={{ paddingRight: "2.75rem" }} placeholder="Enter your password" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-1">
                <button type="button" className="mc-btn">Sign In</button>
              </div>
            </form>

            {/* Feature pills */}
            <div className="mt-6 flex flex-wrap gap-2">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] text-gray-500 font-medium"
                  style={{ background: "#f3f4f6" }}>
                  <f.icon className="w-3 h-3 text-gray-400" />
                  {f.label}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 pb-6 pt-0 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <ShieldCheck className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />
              <span>Secure connection</span>
            </div>
            <div className="flex items-center gap-1.5">
              <img src="/__mockup/images/liveu-logo.png" alt="LiveU" className="h-3.5 w-auto object-contain opacity-60" />
              <p className="text-[10px] text-gray-400">Live U Pvt Ltd</p>
            </div>
          </div>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">Sri Lanka Post · Colombo © 2026</p>
      </div>
    </div>
  );
}
