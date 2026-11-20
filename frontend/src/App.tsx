import { useEffect, useState } from 'react';
import { 
  Server, 
  Activity, 
  Database, 
  Layers, 
  CheckCircle, 
  AlertTriangle, 
  Send, 
  Sliders, 
  FileText, 
  Compass, 
  Upload, 
  RefreshCw 
} from 'lucide-react';
import { fetchHealth, fetchReadiness, HealthResponse, ReadinessResponse } from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'destinations' | 'connectors' | 'publish' | 'rules' | 'certification' | 'import' | 'recommender' | 'metrics' | 'settings'>('dashboard');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, r] = await Promise.all([fetchHealth(), fetchReadiness()]);
      setHealth(h);
      setReadiness(r);
    } catch (err: any) {
      setError(err?.message || 'Failed to connect to backend service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'destinations', label: 'Destination Catalogue', icon: Layers },
    { id: 'connectors', label: 'Connectors (6 Core)', icon: Server },
    { id: 'publish', label: 'Publish Content', icon: Send },
    { id: 'rules', label: 'Posting Rules Engine', icon: Sliders },
    { id: 'certification', label: 'Certification Harness', icon: CheckCircle },
    { id: 'import', label: 'Catalogue Import', icon: Upload },
    { id: 'recommender', label: 'Recommendations', icon: Compass },
    { id: 'metrics', label: 'Normalised Metrics', icon: FileText },
    { id: 'settings', label: 'Settings & Status', icon: RefreshCw },
  ];

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between">
        <div>
          <div className="flex items-center space-x-3 px-2 py-3 mb-6">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/30">
              IX
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white">IncuBrix</h1>
              <p className="text-xs text-slate-400 font-medium">Destination Network</p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* System Pill Footer */}
        <div className="border-t border-slate-800/80 pt-4 mt-6">
          <div className="flex items-center justify-between text-xs px-2 text-slate-400">
            <span>Core Service</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              health?.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}>
              {health?.status === 'ok' ? 'Operational' : 'Connecting...'}
            </span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white capitalize">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Autonomous long-tail content distribution connector engine
            </p>
          </div>
          <button
            onClick={checkStatus}
            disabled={loading}
            className="flex items-center space-x-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Probes</span>
          </button>
        </header>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-200">Backend Connection Warning</p>
              <p className="text-xs text-rose-300 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Phase 1 Overview / Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">HTTP Service</span>
              <Activity className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-3">{health ? 'Active' : 'Standby'}</p>
            <div className="flex items-center space-x-2 mt-2 text-xs text-slate-400">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Uptime: {health?.uptime_seconds ?? 0}s</span>
              <span>•</span>
              <span>v{health?.version || '1.0.0'}</span>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">PostgreSQL Status</span>
              <Database className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-3">
              {readiness?.checks?.database?.status === 'ok' ? 'Connected' : 'Configured'}
            </p>
            <p className="text-xs text-slate-400 mt-2 truncate">
              {readiness?.checks?.database?.message || 'Prisma ORM schema ready'}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Redis & BullMQ</span>
              <Server className="h-4 w-4 text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-white mt-3">
              {readiness?.checks?.redis?.status === 'ok' ? 'Ready' : 'Configured'}
            </p>
            <p className="text-xs text-slate-400 mt-2 truncate">
              {readiness?.checks?.redis?.message || 'BullMQ queue worker adapter'}
            </p>
          </div>
        </div>

        {/* Phase 1 Verification details card */}
        <div className="rounded-2xl bg-slate-900/50 border border-slate-800 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Phase 1 Foundation Architecture</h3>
          <p className="text-sm text-slate-300 mb-4 leading-relaxed">
            The monorepo foundation is configured with a TypeScript Express backend, Prisma ORM schema, BullMQ background job queues, structured JSON logging with secret masking, and a Vite + React dashboard.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block mb-1">Backend Liveness:</span>
              <span className="text-indigo-400">GET /health</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block mb-1">Dependency Readiness:</span>
              <span className="text-indigo-400">GET /ready</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block mb-1">Standard Error Format:</span>
              <span className="text-indigo-400">&#123; error: &#123; code, message, retryable &#125; &#125;</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
              <span className="text-slate-400 block mb-1">Idempotency & Correlation:</span>
              <span className="text-indigo-400">X-Correlation-Id / Idempotency-Key</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
