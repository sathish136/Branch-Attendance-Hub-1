import { Mail, Lock, Eye, EyeOff, Shield, ArrowRight } from "lucide-react";
import { useState } from "react";

export function FullCover() {
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center font-['Inter']">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .fc-input {
          width: 100%; padding: 0.8rem 1rem 0.8rem 2.75rem;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 0.75rem; font-size: 0.875rem; color: #fff;
          outline: none; transition: all 0.2s; font-family: inherit;
        }
        .fc-input::placeholder { color: rgba(255,255,255,0.35); }
        .fc-input:focus { border-color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.12); box-shadow: 0 0 0 3px rgba(255,255,255,0.06); }
        .fc-btn {
          width: 100%; padding: 0.875rem; border-radius: 0.875rem;
          font-size: 0.9375rem; font-weight: 700; color: #cc1f2a; border: none;
          cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.3);
          transition: all 0.2s;
        }
        .fc-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
        @keyframes fc-float { 0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)} }
        @keyframes fc-fade { from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)} }
        .fc-anim { animation: fc-fade 0.6s ease both; }
        .fc-anim-delay { animation: fc-fade 0.6s 0.15s ease both; }
      `}</style>

      {/* Full-screen gradient background */}
      <div className="absolute inset-0"
        style={{ background: "linear-gradient(145deg, #0d1b2a 0%, #1c0a12 40%, #2d0f16 70%, #0d1b2a 100%)" }} />

      {/* Background geometric shapes */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-[0.07]"
        style={{ background: "radial-gradient(circle, #cc1f2a 0%, transparent 70%)", transform: "translate(30%, -30%)" }} />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full opacity-[0.06]"
        style={{ background: "radial-gradient(circle, #818cf8 0%, transparent 70%)", transform: "translate(-30%, 30%)" }} />

      {/* Grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

      {/* Floating accent squares */}
      <div className="absolute top-[15%] left-[8%] w-16 h-16 rounded-xl border border-white/6 rotate-12" style={{ background: "rgba(204,31,42,0.08)" }} />
      <div className="absolute bottom-[20%] right-[10%] w-12 h-12 rounded-lg border border-white/5 -rotate-6" style={{ background: "rgba(129,140,248,0.08)" }} />
      <div className="absolute top-[55%] left-[5%] w-8 h-8 rounded-lg border border-white/5 rotate-45" style={{ background: "rgba(255,255,255,0.04)" }} />

      {/* Content */}
      <div className="relative z-10 w-full max-w-[420px] px-6">

        {/* Logo + brand */}
        <div className="fc-anim text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl blur-lg opacity-50" style={{ background: "#cc1f2a" }} />
              <div className="relative w-16 h-16 rounded-2xl bg-white flex items-center justify-center p-2 shadow-2xl">
                <img src="/__mockup/images/srilanka-post-logo.png" alt="SLP" className="w-full h-full object-contain" />
              </div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sri Lanka Post</h1>
          <p className="text-white/40 text-sm mt-1">Workforce Intelligence Platform</p>
        </div>

        {/* Glass card */}
        <div className="fc-anim-delay rounded-2xl p-8 border border-white/10"
          style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(40px)", boxShadow: "0 32px 64px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)" }}>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ boxShadow: "0 0 6px #4ade80" }} />
              <span className="text-white/50 text-[11px] font-medium">System Online · Colombo District</span>
            </div>
            <h2 className="text-[22px] font-bold text-white tracking-tight">Sign in to your account</h2>
            <p className="text-white/40 text-sm mt-1">Enter your credentials to continue</p>
          </div>

          <form className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1.5 uppercase tracking-wider">Username</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input className="fc-input" placeholder="Enter your username" />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-white/50 mb-1.5 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input type={showPw ? "text" : "password"} className="fc-input" style={{ paddingRight: "2.75rem" }} placeholder="Enter password" />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button type="button" className="fc-btn">
                <span>Sign In to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Divider */}
          <div className="mt-6 pt-5 border-t border-white/8 flex items-center justify-center gap-1.5">
            <img src="/__mockup/images/liveu-logo.png" alt="LiveU" className="h-4 w-auto object-contain opacity-70" />
            <p className="text-[11px] text-white/35">Powered by <span className="font-medium text-white/50">Live U Pvt Ltd</span></p>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-5 flex items-center justify-center gap-2 text-white/25 text-[11px]">
          <Shield className="w-3 h-3" />
          <span>AES-256 encrypted · Enterprise security</span>
        </div>
      </div>
    </div>
  );
}
