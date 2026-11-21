import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, CheckCircle, Compass, Database,
  FileText, Layers, RefreshCw, Send, Server, Sliders, Upload,
  Plus, X, BarChart2, Shield, Zap, Eye
} from 'lucide-react';
import {
  fetchHealth, fetchReadiness, fetchDestinations, addDestination,
  fetchPublications, publishContent, evaluateRules, captureRules, confirmRules,
  fetchCertifications, recertifyDue, importCatalogue, fetchImportHistory,
  fetchRecommendations, evaluatePrecision, fetchMetrics, testConnector,
  generateIdempotencyKey,
  HealthResponse, ReadinessResponse, Destination, Publication,
  PublishResult, RulesEvaluateResult, RulesCaptureResult, ImportSummary,
  ImportRecord, RecommendationItem, MetricsResult, RecertifyResult,
  EvaluatePrecisionResult, Certification
} from './services/api';

// ─── Types ───────────────────────────────────────────────────
type TabId =
  | 'dashboard' | 'destinations' | 'connectors' | 'publish'
  | 'rules' | 'certification' | 'import' | 'recommender'
  | 'metrics' | 'settings';

// ─── Shared UI helpers ────────────────────────────────────────
function Badge({ label, color = 'slate' }: { label: string; color?: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-emerald-500/20 text-emerald-300',
    red: 'bg-rose-500/20 text-rose-300',
    yellow: 'bg-amber-500/20 text-amber-300',
    blue: 'bg-blue-500/20 text-blue-300',
    slate: 'bg-slate-700 text-slate-300',
    indigo: 'bg-indigo-500/20 text-indigo-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${colorMap[color] ?? colorMap.slate}`}>
      {label}
    </span>
  );
}

function Spinner() {
  return <RefreshCw className="h-4 w-4 animate-spin text-indigo-400 inline-block mr-2" />;
}

function ErrorBox({ msg }: { msg: string }) {
  return (
    <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3 my-4">
      <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
      <p className="text-sm text-rose-300">{msg}</p>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-slate-900/70 border border-slate-800/80 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color = 'indigo' }: { label: string; value: string | number; icon: React.ElementType; color?: string }) {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
    blue: 'text-blue-400',
    violet: 'text-violet-400',
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <Icon className={`h-4 w-4 ${colorMap[color] ?? colorMap.indigo}`} />
      </div>
      <p className="text-2xl font-bold text-white mt-3">{value}</p>
    </Card>
  );
}

function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h3 className="text-lg font-bold text-white">{title}</h3>
      {children}
    </div>
  );
}

function Btn({
  onClick, disabled, variant = 'primary', children, className = ''
}: {
  onClick?: () => void; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger'; children: React.ReactNode; className?: string;
}) {
  const styles = {
    primary: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm shadow-indigo-600/30',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
    danger: 'bg-rose-700 hover:bg-rose-600 text-white',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

function Input({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
      <input
        {...props}
        className={`w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${props.className ?? ''}`}
      />
    </div>
  );
}

function Textarea({ label, ...props }: { label?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
      <textarea
        {...props}
        className={`w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-y ${props.className ?? ''}`}
      />
    </div>
  );
}

function Select({ label, options, ...props }: { label?: string; options: { value: string; label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-slate-400">{label}</label>}
      <select
        {...props}
        className={`w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${props.className ?? ''}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── CONNECTOR DATA ───────────────────────────────────────────
const CONNECTORS = [
  { key: 'discourse', name: 'Discourse', description: 'Community forum publishing via Discourse API', capabilities: ['validate', 'publish', 'getStatus', 'delete', 'metrics'] },
  { key: 'lemmy', name: 'Lemmy', description: 'Federated link aggregator (ActivityPub)', capabilities: ['validate', 'publish', 'getStatus', 'delete'] },
  { key: 'devto', name: 'Dev.to', description: 'Developer blog publishing platform', capabilities: ['validate', 'publish', 'getStatus', 'delete', 'metrics'] },
  { key: 'ghost', name: 'Ghost', description: 'Modern publishing platform CMS', capabilities: ['validate', 'publish', 'getStatus', 'delete', 'metrics'] },
  { key: 'webhook', name: 'Webhook', description: 'Generic HTTP webhook delivery', capabilities: ['validate', 'publish', 'getStatus'] },
  { key: 'assisted', name: 'Assisted', description: 'Manual-assist human-in-the-loop publishing', capabilities: ['validate', 'publish', 'getStatus', 'delete'] },
  { key: 'hashnode', name: 'Hashnode', description: 'Developer blogging via Hashnode API', capabilities: ['validate', 'publish', 'getStatus', 'delete', 'metrics'] },
  { key: 'slack', name: 'Slack', description: 'Post messages to Slack channels', capabilities: ['validate', 'publish', 'getStatus', 'delete'] },
  { key: 'peertube', name: 'PeerTube', description: 'Federated video hosting (ActivityPub)', capabilities: ['validate', 'publish', 'getStatus', 'delete', 'metrics'] },
];

// ─── TAB: Dashboard ──────────────────────────────────────────
function DashboardTab({ health, readiness }: { health: HealthResponse | null; readiness: ReadinessResponse | null }) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([fetchDestinations(), fetchPublications()]).then(([d, p]) => {
      if (d.status === 'fulfilled') setDestinations(d.value);
      if (p.status === 'fulfilled') setPublications(p.value);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      {health?.simulation_mode && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
          <Zap className="h-3.5 w-3.5" /> Simulation Mode Active
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="HTTP Service" value={health ? 'Active' : 'Standby'} icon={Activity} color="indigo" />
        <StatCard label="Destinations" value={loading ? '…' : destinations.length} icon={Layers} color="emerald" />
        <StatCard label="Publications" value={loading ? '…' : publications.length} icon={Send} color="blue" />
        <StatCard label="Connectors" value={CONNECTORS.length} icon={Server} color="violet" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">PostgreSQL</span>
            <Database className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white mt-3">
            {readiness?.checks?.database?.status === 'ok' ? 'Connected' : 'Configured'}
          </p>
          <p className="text-xs text-slate-400 mt-1 truncate">{readiness?.checks?.database?.message || 'Prisma ORM'}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Redis & BullMQ</span>
            <Server className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-white mt-3">
            {readiness?.checks?.redis?.status === 'ok' ? 'Ready' : 'Configured'}
          </p>
          <p className="text-xs text-slate-400 mt-1 truncate">{readiness?.checks?.redis?.message || 'Queue adapter'}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Uptime</span>
            <Activity className="h-4 w-4 text-indigo-400" />
          </div>
          <p className="text-xl font-bold text-white mt-3">{health?.uptime_seconds ?? 0}s</p>
          <p className="text-xs text-slate-400 mt-1">v{health?.version || '1.0.0'}</p>
        </Card>
      </div>

      {/* Recent Publications */}
      <Card className="p-6">
        <SectionHeader title="Recent Publications" />
        {loading ? <p className="text-slate-400 text-sm"><Spinner />Loading…</p> : publications.length === 0 ? (
          <p className="text-slate-400 text-sm">No publications yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-800">
                  <th className="pb-2 pr-4">Title</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {publications.slice(0, 5).map((pub) => (
                  <tr key={pub.id} className="text-slate-300 hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{pub.title}</td>
                    <td className="py-2 pr-4">
                      <Badge label={pub.status} color={pub.status === 'published' ? 'green' : pub.status === 'failed' ? 'red' : 'yellow'} />
                    </td>
                    <td className="py-2 text-slate-400 text-xs">{new Date(pub.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Connector summary */}
      <Card className="p-6">
        <SectionHeader title="Registered Connectors" />
        <div className="flex flex-wrap gap-2">
          {CONNECTORS.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-medium text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              {c.name}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── TAB: Destinations ────────────────────────────────────────
function DestinationsTab() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', platform_key: '', connector_key: '', language: 'en' });

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetchDestinations().then(setDestinations).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const platforms = Array.from(new Set(destinations.map((d) => d.platform_key)));
  const filtered = filterPlatform ? destinations.filter((d) => d.platform_key === filterPlatform) : destinations;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await addDestination(form);
      setShowForm(false);
      setForm({ name: '', url: '', platform_key: '', connector_key: '', language: 'en' });
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add destination');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <select
            value={filterPlatform}
            onChange={(e) => setFilterPlatform(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <option value="">All Platforms</option>
            {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <span className="text-xs text-slate-400">{filtered.length} destinations</span>
        </div>
        <Btn onClick={() => setShowForm(!showForm)} variant="primary">
          <Plus className="h-4 w-4" /> Add Destination
        </Btn>
      </div>

      {showForm && (
        <Card className="p-6">
          <SectionHeader title="Add New Destination">
            <button onClick={() => setShowForm(false)}><X className="h-4 w-4 text-slate-400 hover:text-slate-200" /></button>
          </SectionHeader>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hacker News" />
            <Input label="URL" required type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
            <Input label="Platform Key" required value={form.platform_key} onChange={(e) => setForm({ ...form, platform_key: e.target.value })} placeholder="e.g. discourse" />
            <Input label="Connector Key" required value={form.connector_key} onChange={(e) => setForm({ ...form, connector_key: e.target.value })} placeholder="e.g. discourse" />
            <Input label="Language" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} placeholder="en" />
            <div className="flex items-end">
              <Btn disabled={submitting} className="w-full justify-center">
                {submitting ? <><Spinner />Saving…</> : 'Save Destination'}
              </Btn>
            </div>
          </form>
        </Card>
      )}

      {error && <ErrorBox msg={error} />}
      {loading ? <p className="text-slate-400"><Spinner />Loading destinations…</p> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-800">
                  {['Name', 'Platform', 'Connector', 'Status', 'Tags', 'Score', 'Certified'].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No destinations found</td></tr>
                ) : filtered.map((d) => (
                  <tr key={d.id} className="text-slate-300 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-medium">{d.name}</td>
                    <td className="px-4 py-3 text-slate-400">{d.platform_key}</td>
                    <td className="px-4 py-3 text-slate-400">{d.connector_key}</td>
                    <td className="px-4 py-3">
                      <Badge label={d.status} color={d.status === 'active' ? 'green' : d.status === 'suspended' ? 'red' : 'yellow'} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{(d.audience_tags || []).join(', ')}</td>
                    <td className="px-4 py-3 text-indigo-400">{d.relevance_score?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {d.last_certified_at ? new Date(d.last_certified_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── TAB: Connectors ─────────────────────────────────────────
function ConnectorsTab() {
  const [testResults, setTestResults] = useState<Record<string, { loading: boolean; result?: string; error?: string }>>({});

  const handleTest = async (key: string) => {
    setTestResults((prev) => ({ ...prev, [key]: { loading: true } }));
    try {
      const result = await testConnector(key, {
        destination_url: 'https://example.com',
        api_key: 'test-key',
        title: 'Test Post',
        body: 'This is a test validation call.',
      });
      setTestResults((prev) => ({
        ...prev,
        [key]: { loading: false, result: result.valid ? '✓ Valid' : `✗ ${result.message || 'Invalid'}` },
      }));
    } catch (e: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [key]: { loading: false, error: e instanceof Error ? e.message : 'Error' },
      }));
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-400">9 registered connector adapters. Each can be validated against a sample payload.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CONNECTORS.map((c) => {
          const tr = testResults[c.key];
          const isHealthy = !['webhook', 'peertube'].includes(c.key);
          return (
            <Card key={c.key} className="p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-bold text-white">{c.name}</h4>
                  <p className="text-xs font-mono text-indigo-400 mt-0.5">{c.key}</p>
                </div>
                <Badge label={isHealthy ? 'Healthy' : 'Unavailable'} color={isHealthy ? 'green' : 'red'} />
              </div>
              <p className="text-xs text-slate-400">{c.description}</p>
              <div className="flex flex-wrap gap-1">
                {c.capabilities.map((cap) => (
                  <span key={cap} className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-slate-300">{cap}</span>
                ))}
              </div>
              <div className="mt-auto pt-2 border-t border-slate-800">
                <Btn variant="secondary" onClick={() => handleTest(c.key)} disabled={tr?.loading} className="w-full justify-center text-xs">
                  {tr?.loading ? <><Spinner />Testing…</> : <><Zap className="h-3.5 w-3.5" />Test Connector</>}
                </Btn>
                {tr && !tr.loading && (
                  <p className={`text-xs mt-2 text-center font-mono ${tr.error ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {tr.error ?? tr.result}
                  </p>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── TAB: Publish Content ─────────────────────────────────────
function PublishTab() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [dstLoading, setDstLoading] = useState(true);
  const [form, setForm] = useState({
    destination_id: '',
    title: '',
    body: '',
    tags: '',
    idempotency_key: generateIdempotencyKey(),
    async: false,
    callback_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDestinations().then((d) => { setDestinations(d); if (d[0]) setForm((f) => ({ ...f, destination_id: d[0].id })); })
      .catch(() => {}).finally(() => setDstLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.destination_id) {
      setError('Please select a destination');
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await publishContent({
        destination_id: form.destination_id,
        title: form.title,
        body: form.body,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        idempotency_key: form.idempotency_key,
        async: form.async,
        callback_url: form.callback_url || undefined,
      });
      setResult(res);
      setForm((f) => ({ ...f, idempotency_key: generateIdempotencyKey() }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Card className="p-6">
        <SectionHeader title="Publish Content" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Select
            label="Destination"
            value={form.destination_id}
            onChange={(e) => setForm({ ...form, destination_id: e.target.value })}
            options={[
              { value: '', label: dstLoading ? 'Loading…' : 'Select destination' },
              ...destinations.map((d) => ({ value: d.id, label: `${d.name} (${d.platform_key})` })),
            ]}
          />
          <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Post title" />
          <Textarea label="Body" required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Post content…" rows={5} />
          <Input label="Tags (comma separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="tag1, tag2" />
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <span className="text-xs font-medium text-slate-400 flex-1">Idempotency Key</span>
            <span className="text-xs font-mono text-indigo-300 truncate">{form.idempotency_key}</span>
            <button type="button" onClick={() => setForm((f) => ({ ...f, idempotency_key: generateIdempotencyKey() }))} className="text-slate-500 hover:text-slate-200">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.async} onChange={(e) => setForm({ ...form, async: e.target.checked })} className="rounded" />
              Async (background job)
            </label>
          </div>
          {form.async && (
            <Input label="Callback URL (optional)" type="url" value={form.callback_url} onChange={(e) => setForm({ ...form, callback_url: e.target.value })} placeholder="https://..." />
          )}
          <Btn disabled={loading || !form.destination_id || !form.title || !form.body} className="w-full justify-center">
            {loading ? <><Spinner />Publishing…</> : <><Send className="h-4 w-4" />Publish</>}
          </Btn>
        </form>
      </Card>

      {error && <ErrorBox msg={error} />}
      {result && (
        <Card className="p-6">
          <SectionHeader title="Publish Result" />
          <div className="space-y-3 text-sm">
            {result.status && <div className="flex gap-3"><span className="text-slate-400 w-32">Status</span><Badge label={result.status} color={result.status === 'published' ? 'green' : 'yellow'} /></div>}
            {result.publication_id && <div className="flex gap-3"><span className="text-slate-400 w-32">Publication ID</span><span className="font-mono text-xs text-indigo-300">{result.publication_id}</span></div>}
            {result.platform_post_id && <div className="flex gap-3"><span className="text-slate-400 w-32">Platform Post ID</span><span className="font-mono text-xs text-slate-300">{result.platform_post_id}</span></div>}
            {result.live_url && <div className="flex gap-3"><span className="text-slate-400 w-32">Live URL</span><a href={result.live_url} className="text-indigo-400 hover:underline text-xs truncate">{result.live_url}</a></div>}
            {result.job_id && <div className="flex gap-3"><span className="text-slate-400 w-32">Job ID</span><span className="font-mono text-xs text-amber-300">{result.job_id}</span></div>}
            {result.message && <div className="flex gap-3"><span className="text-slate-400 w-32">Message</span><span className="text-slate-300">{result.message}</span></div>}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── TAB: Rules Engine ────────────────────────────────────────
function RulesTab() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [evalForm, setEvalForm] = useState({ destination_id: '', title: '', body: '', tags: '' });
  const [evalResult, setEvalResult] = useState<RulesEvaluateResult | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const [captureForm, setCaptureForm] = useState({ destination_id: '', policy_text: '' });
  const [captureResult, setCaptureResult] = useState<RulesCaptureResult | null>(null);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchDestinations().then((d) => { setDestinations(d); if (d[0]) { setEvalForm((f) => ({ ...f, destination_id: d[0].id })); setCaptureForm((f) => ({ ...f, destination_id: d[0].id })); } }).catch(() => {});
  }, []);

  const handleEval = async (e: React.FormEvent) => {
    e.preventDefault(); setEvalLoading(true); setEvalError(null); setEvalResult(null);
    try {
      const r = await evaluateRules({ destination_id: evalForm.destination_id, title: evalForm.title, body: evalForm.body, tags: evalForm.tags.split(',').map((t) => t.trim()).filter(Boolean) });
      setEvalResult(r);
    } catch (err: unknown) { setEvalError(err instanceof Error ? err.message : 'Error'); }
    finally { setEvalLoading(false); }
  };

  const handleCapture = async (e: React.FormEvent) => {
    e.preventDefault(); setCaptureLoading(true); setCaptureError(null); setCaptureResult(null);
    try {
      const r = await captureRules({ destination_id: captureForm.destination_id, policy_text: captureForm.policy_text });
      setCaptureResult(r);
    } catch (err: unknown) { setCaptureError(err instanceof Error ? err.message : 'Error'); }
    finally { setCaptureLoading(false); }
  };

  const handleConfirm = async () => {
    setConfirmLoading(true); setConfirmMsg(null);
    try {
      const r = await confirmRules({ capture_id: captureResult?.capture_id, destination_id: captureForm.destination_id, confirmed: true });
      setConfirmMsg(r.message || 'Rules confirmed successfully');
    } catch (err: unknown) { setConfirmMsg(err instanceof Error ? err.message : 'Error'); }
    finally { setConfirmLoading(false); }
  };

  const verdictColor: Record<string, string> = { pass: 'green', block: 'red', reschedule: 'yellow' };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Rule Evaluator */}
      <Card className="p-6">
        <SectionHeader title="Rule Evaluator" />
        <form onSubmit={handleEval} className="space-y-4">
          <Select label="Destination" value={evalForm.destination_id} onChange={(e) => setEvalForm({ ...evalForm, destination_id: e.target.value })}
            options={[{ value: '', label: 'Select destination' }, ...destinations.map((d) => ({ value: d.id, label: d.name }))]} />
          <Input label="Title" value={evalForm.title} onChange={(e) => setEvalForm({ ...evalForm, title: e.target.value })} placeholder="Content title" />
          <Textarea label="Body" value={evalForm.body} onChange={(e) => setEvalForm({ ...evalForm, body: e.target.value })} rows={3} placeholder="Content body…" />
          <Input label="Tags" value={evalForm.tags} onChange={(e) => setEvalForm({ ...evalForm, tags: e.target.value })} placeholder="tag1, tag2" />
          <Btn disabled={evalLoading || !evalForm.destination_id} className="w-full justify-center">
            {evalLoading ? <><Spinner />Evaluating…</> : <><Shield className="h-4 w-4" />Evaluate Rules</>}
          </Btn>
        </form>
        {evalError && <ErrorBox msg={evalError} />}
        {evalResult && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm">Verdict</span>
              <Badge label={evalResult.verdict.toUpperCase()} color={verdictColor[evalResult.verdict] ?? 'slate'} />
            </div>
            {evalResult.reasons.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Reasons:</p>
                <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                  {evalResult.reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* AI Rules Capture */}
      <Card className="p-6">
        <SectionHeader title="AI Rules Capture" />
        <form onSubmit={handleCapture} className="space-y-4">
          <Select label="Destination" value={captureForm.destination_id} onChange={(e) => setCaptureForm({ ...captureForm, destination_id: e.target.value })}
            options={[{ value: '', label: 'Select destination' }, ...destinations.map((d) => ({ value: d.id, label: d.name }))]} />
          <Textarea label="Policy Text" required value={captureForm.policy_text} onChange={(e) => setCaptureForm({ ...captureForm, policy_text: e.target.value })} rows={5} placeholder="Paste community guidelines or posting policy…" />
          <Btn disabled={captureLoading || !captureForm.destination_id || !captureForm.policy_text} className="w-full justify-center">
            {captureLoading ? <><Spinner />Capturing…</> : 'Capture Rules with AI'}
          </Btn>
        </form>
        {captureError && <ErrorBox msg={captureError} />}
        {captureResult && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-400">{captureResult.draft_rules.length} draft rules extracted</p>
            {captureResult.draft_rules.map((r, i) => (
              <div key={i} className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm space-y-1">
                <p className="text-slate-200">{r.rule_text}</p>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>Confidence: <span className="text-indigo-300 font-mono">{(r.confidence * 100).toFixed(0)}%</span></span>
                  {r.evidence && <span>Evidence: <span className="text-slate-300 italic">{r.evidence}</span></span>}
                </div>
              </div>
            ))}
            <Btn variant="secondary" disabled={confirmLoading} onClick={handleConfirm} className="w-full justify-center">
              {confirmLoading ? <><Spinner />Confirming…</> : <><CheckCircle className="h-4 w-4" />Confirm Rules</>}
            </Btn>
            {confirmMsg && <p className="text-xs text-emerald-400 text-center">{confirmMsg}</p>}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── TAB: Certification Harness ───────────────────────────────
function CertificationTab() {
  const [certs, setCerts] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recertResult, setRecertResult] = useState<RecertifyResult | null>(null);
  const [recertLoading, setRecertLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    fetchCertifications().then(setCerts).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleRecertify = async () => {
    setRecertLoading(true);
    try { const r = await recertifyDue(); setRecertResult(r); load(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setRecertLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{certs.length} certifications tracked</p>
        <Btn onClick={handleRecertify} disabled={recertLoading}>
          {recertLoading ? <><Spinner />Running…</> : <><RefreshCw className="h-4 w-4" />Run Recertification</>}
        </Btn>
      </div>

      {error && <ErrorBox msg={error} />}

      {recertResult && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-white mb-3">Recertification Outcomes ({recertResult.processed} processed)</p>
          <div className="space-y-2">
            {recertResult.outcomes.map((o, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-slate-300 flex-1">{o.name} <span className="text-slate-400">({o.platform})</span></span>
                <Badge label={o.result} color={o.result === 'certified' ? 'green' : o.result === 'demoted' ? 'red' : 'yellow'} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? <p className="text-slate-400"><Spinner />Loading certifications…</p> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-800">
                  {['Name', 'Platform', 'Status', 'Last Certified', 'Days Since', 'Recert Due'].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {certs.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">No certifications found</td></tr>
                ) : certs.map((c) => {
                  const demoted = c.status === 'demoted';
                  return (
                    <tr key={c.id} className={`hover:bg-slate-800/30 transition-colors ${demoted ? 'bg-rose-900/20' : ''}`}>
                      <td className={`px-4 py-3 font-medium ${demoted ? 'text-rose-300' : 'text-slate-200'}`}>{c.name}</td>
                      <td className="px-4 py-3 text-slate-400">{c.platform}</td>
                      <td className="px-4 py-3">
                        <Badge label={c.status} color={c.status === 'certified' ? 'green' : c.status === 'demoted' ? 'red' : 'yellow'} />
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{c.last_certified_at ? new Date(c.last_certified_at).toLocaleDateString() : '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{c.days_since ?? '—'}</td>
                      <td className="px-4 py-3">
                        {c.recertification_due ? <Badge label="Due" color="red" /> : <Badge label="Current" color="green" />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── TAB: Catalogue Import ────────────────────────────────────
function ImportTab() {
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    fetchImportHistory().then(setHistory).catch(() => {}).finally(() => setHistLoading(false));
  }, []);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    setLoading(true); setError(null); setImportResult(null);
    try {
      const r = await importCatalogue(csvText);
      setImportResult(r);
      setHistory((prev) => [{ id: Date.now().toString(), created_at: new Date().toISOString(), total_rows: r.total_rows, valid_rows: r.valid_rows, invalid_rows: r.invalid_rows, duplicate_rows: r.duplicate_rows }, ...prev]);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Import failed'); }
    finally { setLoading(false); }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string || '');
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionHeader title="CSV Import" />
        <form onSubmit={handleImport} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-400">Upload CSV File</label>
            <input type="file" accept=".csv,text/plain" onChange={handleFile}
              className="text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-200 hover:file:bg-slate-600 cursor-pointer" />
          </div>
          <Textarea label="Or paste CSV content" value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8} placeholder="name,url,platform_key,connector_key,language&#10;My Forum,https://forum.example.com,discourse,discourse,en" />
          <Btn disabled={loading || !csvText.trim()} className="w-full justify-center">
            {loading ? <><Spinner />Importing…</> : <><Upload className="h-4 w-4" />Import CSV</>}
          </Btn>
        </form>
      </Card>

      {error && <ErrorBox msg={error} />}

      {importResult && (
        <Card className="p-6">
          <SectionHeader title="Import Summary" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatCard label="Total Rows" value={importResult.total_rows} icon={FileText} color="indigo" />
            <StatCard label="Valid" value={importResult.valid_rows} icon={CheckCircle} color="emerald" />
            <StatCard label="Duplicates" value={importResult.duplicate_rows} icon={Eye} color="amber" />
            <StatCard label="Invalid" value={importResult.invalid_rows} icon={X} color="rose" />
          </div>
          <p className="text-xs text-slate-400">Duration: {importResult.duration_ms}ms</p>
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-semibold text-white mb-2">Row Errors</p>
              <div className="space-y-1">
                {importResult.errors.map((err, i) => (
                  <div key={i} className="flex gap-3 text-xs p-2 rounded bg-slate-800/50">
                    <span className="text-slate-400">Row {err.row}</span>
                    <span className="text-rose-300">{err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-6">
        <SectionHeader title="Import History" />
        {histLoading ? <p className="text-slate-400 text-sm"><Spinner />Loading…</p> : history.length === 0 ? (
          <p className="text-slate-400 text-sm">No import history.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-800">
                  {['Date', 'Total', 'Valid', 'Dupes', 'Invalid'].map((h) => <th key={h} className="px-4 py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((r) => (
                  <tr key={r.id} className="text-slate-300 hover:bg-slate-800/30">
                    <td className="px-4 py-2 text-xs text-slate-400">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2">{r.total_rows}</td>
                    <td className="px-4 py-2 text-emerald-400">{r.valid_rows}</td>
                    <td className="px-4 py-2 text-amber-400">{r.duplicate_rows}</td>
                    <td className="px-4 py-2 text-rose-400">{r.invalid_rows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── TAB: Recommendations ─────────────────────────────────────
function RecommendationsTab() {
  const [form, setForm] = useState({ title: '', body: '', tags: '', is_commercial: false });
  const [results, setResults] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [precisionResult, setPrecisionResult] = useState<EvaluatePrecisionResult | null>(null);
  const [precisionLoading, setPrecisionLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null); setResults([]);
    try {
      const r = await fetchRecommendations({ title: form.title, body: form.body, tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), is_commercial: form.is_commercial });
      setResults(r.recommendations ?? []);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  };

  const handlePrecision = async () => {
    setPrecisionLoading(true);
    try { const r = await evaluatePrecision(); setPrecisionResult(r); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setPrecisionLoading(false); }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 col-span-1">
          <SectionHeader title="Get Recommendations" />
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="Title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Content title" />
            <Textarea label="Body" required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} rows={4} placeholder="Content body…" />
            <Input label="Tags" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="tag1, tag2" />
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={form.is_commercial} onChange={(e) => setForm({ ...form, is_commercial: e.target.checked })} className="rounded" />
              Commercial content
            </label>
            <Btn disabled={loading || !form.title || !form.body} className="w-full justify-center">
              {loading ? <><Spinner />Analyzing…</> : <><Compass className="h-4 w-4" />Get Recommendations</>}
            </Btn>
          </form>
        </Card>

        <div className="col-span-1 lg:col-span-2 space-y-4">
          {error && <ErrorBox msg={error} />}
          {results.length > 0 && (
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 text-xs uppercase border-b border-slate-800">
                      {['Rank', 'Score', 'Destination', 'Platform', 'Reasons', 'Warnings'].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {results.map((r) => (
                      <tr key={r.rank} className="text-slate-300 hover:bg-slate-800/30">
                        <td className="px-4 py-3 font-bold text-indigo-400">#{r.rank}</td>
                        <td className="px-4 py-3 font-mono text-xs">{r.score?.toFixed(3)}</td>
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="px-4 py-3 text-slate-400">{r.platform}</td>
                        <td className="px-4 py-3 text-xs text-emerald-300">{(r.reasons || []).join(', ')}</td>
                        <td className="px-4 py-3 text-xs text-amber-300">{(r.warnings || []).join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Btn variant="secondary" onClick={handlePrecision} disabled={precisionLoading} className="w-full justify-center">
            {precisionLoading ? <><Spinner />Evaluating…</> : <><BarChart2 className="h-4 w-4" />Evaluate Precision@10</>}
          </Btn>

          {precisionResult && (
            <Card className="p-5">
              <p className="text-sm font-semibold text-white mb-3">Precision@10 Evaluation</p>
              <div className="text-3xl font-bold text-indigo-400 mb-4">{(precisionResult.average_precision_at_10 * 100).toFixed(1)}%</div>
              {precisionResult.cases && precisionResult.cases.length > 0 && (
                <div className="space-y-2">
                  {precisionResult.cases.map((c, i) => (
                    <div key={i} className="flex justify-between text-xs text-slate-300">
                      <span className="text-slate-400 truncate max-w-[200px]">{c.query}</span>
                      <span className="font-mono text-indigo-300">{(c.precision * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TAB: Metrics ─────────────────────────────────────────────
function MetricsTab() {
  const [publications, setPublications] = useState<Publication[]>([]);
  const [pubLoading, setPubLoading] = useState(true);
  const [publicationId, setPublicationId] = useState('');
  const [metrics, setMetrics] = useState<MetricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPublications().then((p) => { setPublications(p); if (p[0]) setPublicationId(p[0].id); }).catch(() => {}).finally(() => setPubLoading(false));
  }, []);

  const handleFetch = async () => {
    if (!publicationId.trim()) return;
    setLoading(true); setError(null); setMetrics(null);
    try { const r = await fetchMetrics(publicationId.trim()); setMetrics(r); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Error'); }
    finally { setLoading(false); }
  };

  const metricCards = metrics ? [
    { label: 'Views', value: metrics.views, icon: Eye, color: 'indigo' },
    { label: 'Likes', value: metrics.likes, icon: CheckCircle, color: 'emerald' },
    { label: 'Comments', value: metrics.comments, icon: FileText, color: 'blue' },
    { label: 'Shares', value: metrics.shares, icon: Send, color: 'violet' },
    { label: 'Clicks', value: metrics.clicks, icon: Activity, color: 'amber' },
  ] : [];

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionHeader title="Fetch Metrics" />
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <Input label="Publication ID" value={publicationId} onChange={(e) => setPublicationId(e.target.value)} placeholder="Enter publication ID" />
          </div>
          <Btn onClick={handleFetch} disabled={loading || !publicationId.trim()}>
            {loading ? <><Spinner />Loading…</> : <><BarChart2 className="h-4 w-4" />Fetch</>}
          </Btn>
        </div>
        {!pubLoading && publications.length > 0 && (
          <div className="mt-3">
            <p className="text-xs text-slate-400 mb-2">Or pick from recent publications:</p>
            <div className="flex flex-wrap gap-2">
              {publications.slice(0, 8).map((p) => (
                <button key={p.id} onClick={() => setPublicationId(p.id)}
                  className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${publicationId === p.id ? 'border-indigo-500 text-indigo-300 bg-indigo-500/10' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
                  {p.title ? p.title.slice(0, 24) : p.id.slice(0, 12)}…
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      {error && <ErrorBox msg={error} />}

      {metrics && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {metricCards.map((m) => <StatCard key={m.label} label={m.label} value={m.value.toLocaleString()} icon={m.icon} color={m.color} />)}
          </div>
          <p className="text-xs text-slate-500">Publication: <span className="font-mono text-slate-400">{metrics.publication_id}</span></p>
        </div>
      )}
    </div>
  );
}

// ─── TAB: Settings ────────────────────────────────────────────
function SettingsTab({ health, readiness }: { health: HealthResponse | null; readiness: ReadinessResponse | null }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6">
          <SectionHeader title="Health Response" />
          <pre className="text-xs font-mono text-slate-300 overflow-auto max-h-60 bg-slate-950/60 rounded-lg p-3 border border-slate-800">
            {JSON.stringify(health, null, 2) ?? 'Loading…'}
          </pre>
        </Card>
        <Card className="p-6">
          <SectionHeader title="Readiness Response" />
          <pre className="text-xs font-mono text-slate-300 overflow-auto max-h-60 bg-slate-950/60 rounded-lg p-3 border border-slate-800">
            {JSON.stringify(readiness, null, 2) ?? 'Loading…'}
          </pre>
        </Card>
      </div>

      <Card className="p-6">
        <SectionHeader title="Environment" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 block text-xs mb-1">Simulation Mode</span>
            <Badge label={health?.simulation_mode ? 'ON' : 'OFF'} color={health?.simulation_mode ? 'amber' : 'green'} />
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 block text-xs mb-1">Version</span>
            <span className="font-mono text-indigo-300">{health?.version || '—'}</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <span className="text-slate-400 block text-xs mb-1">Service</span>
            <span className="font-mono text-slate-300">{health?.service || '—'}</span>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <SectionHeader title="Registered Connectors" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CONNECTORS.map((c) => (
            <div key={c.key} className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <p className="font-semibold text-white text-sm">{c.name}</p>
              <p className="font-mono text-xs text-indigo-400">{c.key}</p>
              <p className="text-xs text-slate-400 mt-1">{c.capabilities.length} capabilities</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <SectionHeader title="Resources" />
        <div className="space-y-3 text-sm">
          <a href="/openapi.yaml" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300 transition-colors">
            <FileText className="h-4 w-4" /> openapi.yaml – Full API Specification
          </a>
          <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-amber-300 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Reset Mock State
            </p>
            <p className="text-xs text-slate-400 mt-1">
              To reset all simulation data, restart the backend service with <code className="bg-slate-800 px-1 rounded">SIMULATION_MODE=true</code>.
              The mock state resets on each process start.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const h = await fetchHealth();
      setHealth(h);
      try {
        const r = await fetchReadiness();
        setReadiness(r);
        if (r.status === 'degraded' && !h.simulation_mode) {
          setError('Backend services degraded: check PostgreSQL / Redis connectivity');
        }
      } catch (rErr: unknown) {
        console.warn('Readiness probe warning:', rErr);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend service');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const navItems: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'destinations', label: 'Destination Catalogue', icon: Layers },
    { id: 'connectors', label: 'Connectors (9 Core)', icon: Server },
    { id: 'publish', label: 'Publish Content', icon: Send },
    { id: 'rules', label: 'Posting Rules Engine', icon: Sliders },
    { id: 'certification', label: 'Certification Harness', icon: CheckCircle },
    { id: 'import', label: 'Catalogue Import', icon: Upload },
    { id: 'recommender', label: 'Recommendations', icon: Compass },
    { id: 'metrics', label: 'Normalised Metrics', icon: FileText },
    { id: 'settings', label: 'Settings & Status', icon: RefreshCw },
  ];

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <DashboardTab health={health} readiness={readiness} />;
      case 'destinations': return <DestinationsTab />;
      case 'connectors': return <ConnectorsTab />;
      case 'publish': return <PublishTab />;
      case 'rules': return <RulesTab />;
      case 'certification': return <CertificationTab />;
      case 'import': return <ImportTab />;
      case 'recommender': return <RecommendationsTab />;
      case 'metrics': return <MetricsTab />;
      case 'settings': return <SettingsTab health={health} readiness={readiness} />;
      default: return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-64 border-r border-slate-800 bg-slate-900/60 p-4 flex flex-col justify-between shrink-0">
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
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
        <div className="border-t border-slate-800/80 pt-4 mt-6">
          <div className="flex items-center justify-between text-xs px-2 text-slate-400">
            <span>Core Service</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              health?.status === 'ok' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
            }`}>
              {health?.status === 'ok' ? 'Operational' : 'Connecting…'}
            </span>
          </div>
          {health?.simulation_mode && (
            <div className="mt-2 mx-2 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 text-center font-semibold">
              SIMULATION MODE
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 bg-slate-950/90 backdrop-blur border-b border-slate-800/80 px-8 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {navItems.find((n) => n.id === activeTab)?.label}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Autonomous long-tail content distribution engine</p>
          </div>
          <div className="flex items-center gap-3">
            {health?.simulation_mode && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-semibold border border-amber-500/30">
                <Zap className="h-3 w-3" /> Simulation Mode
              </span>
            )}
            <button
              onClick={checkStatus}
              disabled={loading}
              className="flex items-center space-x-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors border border-slate-700"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-3">
              <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-rose-200">Backend Connection Warning</p>
                <p className="text-xs text-rose-300 mt-0.5">{error}</p>
              </div>
            </div>
          )}
          {renderTab()}
        </div>
      </main>
    </div>
  );
}
