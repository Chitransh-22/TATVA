import { useState } from 'react';
import { User, Lock, Mail, X, ShieldCheck } from 'lucide-react';
import { TatvaLogo } from './TatvaLogo';

export function AuthModal({ isOpen, onClose }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="bg-[#091224] text-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-blue-900/40 relative animate-in fade-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <TatvaLogo size="sm" showText={true} />
          <h3 className="text-xl font-bold tracking-tight mt-3">
            {isLogin ? 'Welcome to TATVA' : 'Create TATVA Account'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 text-center">
            {isLogin
              ? 'Access real-time meteorological telemetry & alerts'
              : 'Join India’s premier weather big data platform'}
          </p>
        </div>

        {success ? (
          <div className="py-6 text-center text-emerald-400">
            <ShieldCheck className="w-12 h-12 mx-auto mb-2" />
            <div className="text-sm font-bold">Authentication Successful</div>
            <div className="text-xs text-slate-400 mt-1">Connecting to live feeds...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {!isLogin && (
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Dr. Rajesh Sharma"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Official or Personal Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@imd.gov.in or email@domain.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-slate-900/80 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs tracking-wide shadow-lg shadow-blue-600/30 transition-all mt-2"
            >
              {isLogin ? 'Sign In to Dashboard' : 'Register Account'}
            </button>

            <div className="pt-2 text-center text-slate-400">
              {isLogin ? "Don't have an account? " : 'Already registered? '}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-blue-400 hover:underline font-semibold"
              >
                {isLogin ? 'Register now' : 'Sign in'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
