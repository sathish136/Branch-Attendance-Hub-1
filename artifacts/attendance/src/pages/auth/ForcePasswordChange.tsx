import { useState } from "react";
import { useLocation } from "wouter";
import { Lock, Eye, EyeOff, CheckCircle2, ChevronRight, LayoutDashboard, Users, Fingerprint, FileBarChart, Settings, X } from "lucide-react";
import srilankaPostLogo from "@/assets/srilanka-post-logo.png";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const TOUR_STEPS = [
  {
    icon: LayoutDashboard,
    title: "Dashboard",
    desc: "View real-time attendance summary, present/absent counts, and recent activity across all your branches.",
    color: "bg-blue-100 text-blue-600",
  },
  {
    icon: Users,
    title: "Employee Management",
    desc: "Add, edit and import employees with biometric IDs. Employee codes are auto-generated using your regional office prefix (e.g. JA2162).",
    color: "bg-emerald-100 text-emerald-600",
  },
  {
    icon: Fingerprint,
    title: "Biometric Devices",
    desc: "Manage ZKTeco devices. Assign each device to a branch — attendance is only recorded for devices with a branch assigned.",
    color: "bg-purple-100 text-purple-600",
  },
  {
    icon: FileBarChart,
    title: "Reports",
    desc: "Generate attendance, payroll, and summary reports. Filter by branch, date range, and employee type.",
    color: "bg-orange-100 text-orange-600",
  },
  {
    icon: Settings,
    title: "Settings",
    desc: "Configure working days, holidays, database connection, and system preferences.",
    color: "bg-gray-100 text-gray-600",
  },
];

function TourModal({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const current = TOUR_STEPS[step];
  const Icon = current.icon;
  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-700 to-red-900 px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-1">
            <img src={srilankaPostLogo} alt="Sri Lanka Post" className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
            <div>
              <p className="font-bold text-sm">Welcome to Sri Lanka Post</p>
              <p className="text-white/60 text-xs">Attendance Management System</p>
            </div>
            <button onClick={onDone} className="ml-auto p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-white/80 text-xs mt-2">Quick tour — {step + 1} of {TOUR_STEPS.length}</p>
          <div className="flex gap-1.5 mt-2">
            {TOUR_STEPS.map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? "bg-white" : "bg-white/30"}`} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${current.color}`}>
            <Icon className="w-7 h-7" />
          </div>
          <h3 className="font-bold text-lg text-gray-900">{current.title}</h3>
          <p className="text-gray-500 text-sm mt-2 leading-relaxed">{current.desc}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          {step > 0 ? (
            <button onClick={() => setStep(s => s - 1)} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
              ← Back
            </button>
          ) : <div />}
          <button
            onClick={() => isLast ? onDone() : setStep(s => s + 1)}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: "linear-gradient(135deg,hsl(357 73% 48%),hsl(357 73% 38%))" }}
          >
            {isLast ? (
              <><CheckCircle2 className="w-4 h-4" /> Go to Dashboard</>
            ) : (
              <>Next <ChevronRight className="w-4 h-4" /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ForcePasswordChange() {
  const [, setLocation] = useLocation();
  const [current, setCurrent] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTour, setShowTour] = useState(false);

  const token = localStorage.getItem("auth_token") || "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!current) { setError("Please enter your current password."); return; }
    if (newPw.length < 6) { setError("New password must be at least 6 characters."); return; }
    if (newPw !== confirm) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: current, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setError(data.message || "Failed to change password."); return; }
      localStorage.removeItem("must_change_password");
      setShowTour(true);
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  }

  function handleTourDone() {
    setShowTour(false);
    setLocation("/");
  }

  return (
    <>
      {showTour && <TourModal onDone={handleTourDone} />}
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "hsl(220 30% 10%)" }}>
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* Header */}
            <div className="px-8 py-6 bg-gradient-to-r from-red-700 to-red-900 text-white text-center">
              <img src={srilankaPostLogo} alt="Sri Lanka Post" className="w-12 h-12 rounded-xl object-contain bg-white p-1 mx-auto mb-3" />
              <h2 className="font-bold text-lg">Set Your Password</h2>
              <p className="text-white/70 text-xs mt-1">You must change your password before continuing</p>
            </div>

            {/* Form */}
            <div className="px-8 py-6">
              {error && (
                <div className="mb-4 flex items-start gap-2 text-sm px-3.5 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
                  <span className="mt-0.5">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Current Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      required type={showCurrent ? "text" : "password"}
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition"
                      placeholder="Enter current password"
                      value={current}
                      onChange={e => setCurrent(e.target.value)}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowCurrent(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      required type={showNew ? "text" : "password"}
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition"
                      placeholder="Min 6 characters"
                      value={newPw}
                      onChange={e => setNewPw(e.target.value)}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowNew(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 block mb-1.5">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      required type={showConfirm ? "text" : "password"}
                      className="w-full pl-9 pr-10 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition"
                      placeholder="Repeat new password"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                    />
                    <button type="button" tabIndex={-1} onClick={() => setShowConfirm(s => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirm && newPw && (
                    <p className={`text-xs mt-1 flex items-center gap-1 ${newPw === confirm ? "text-green-600" : "text-red-500"}`}>
                      <CheckCircle2 className="w-3 h-3" />
                      {newPw === confirm ? "Passwords match" : "Passwords do not match"}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold text-white mt-2 transition-all disabled:opacity-70"
                  style={{ background: "linear-gradient(135deg,hsl(357 73% 48%),hsl(357 73% 38%))" }}
                >
                  {loading ? "Updating..." : "Set New Password & Continue"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
