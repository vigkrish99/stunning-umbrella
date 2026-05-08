"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Shield, Plus, Pencil, Trash2, X, Check, Mail, MessageSquare } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

type AgentRoleName = "owner" | "manager" | "sales" | "driver" | "operations";

interface AgentRoleDoc {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  role: AgentRoleName;
  permissions: {
    reports: {
      daily: boolean;
      monday: boolean;
      friday: boolean;
      channels: Array<"email" | "whatsapp">;
    };
    orders: {
      canPlace: boolean;
      canApprove: boolean;
      canCancel: boolean;
    };
    queries: {
      canQueryCustomers: boolean;
      canQueryMetrics: boolean;
      canQueryFinancials: boolean;
    };
  };
  segment?: string;
  isActive: boolean;
}

type FormData = {
  name: string;
  email: string;
  phone: string;
  role: AgentRoleName;
  isActive: boolean;
  permissions: {
    reports: {
      daily: boolean;
      monday: boolean;
      friday: boolean;
      channels: Array<"email" | "whatsapp">;
    };
    orders: {
      canPlace: boolean;
      canApprove: boolean;
      canCancel: boolean;
    };
    queries: {
      canQueryCustomers: boolean;
      canQueryMetrics: boolean;
      canQueryFinancials: boolean;
    };
  };
};

// ── Constants ──────────────────────────────────────────────────────

const ROLE_OPTIONS: { value: AgentRoleName; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "sales", label: "Sales" },
  { value: "driver", label: "Driver" },
  { value: "operations", label: "Operations" },
];

const ROLE_BADGE: Record<AgentRoleName, string> = {
  owner:
    "bg-[oklch(0.65_0.15_50)]/15 text-[oklch(0.65_0.15_50)] border border-[oklch(0.65_0.15_50)]/20",
  manager:
    "bg-[oklch(0.55_0.08_200)]/15 text-[oklch(0.55_0.08_200)] border border-[oklch(0.55_0.08_200)]/20",
  sales:
    "bg-[oklch(0.55_0.06_220)]/15 text-[oklch(0.55_0.06_220)] border border-[oklch(0.55_0.06_220)]/20",
  driver: "bg-secondary text-muted-foreground border border-border",
  operations: "bg-secondary text-muted-foreground border border-border",
};

const EMPTY_FORM: FormData = {
  name: "",
  email: "",
  phone: "",
  role: "sales",
  isActive: true,
  permissions: {
    reports: { daily: false, monday: false, friday: false, channels: [] },
    orders: { canPlace: false, canApprove: false, canCancel: false },
    queries: {
      canQueryCustomers: false,
      canQueryMetrics: false,
      canQueryFinancials: false,
    },
  },
};

// ── Helpers ────────────────────────────────────────────────────────

function channelHas(
  channels: Array<"email" | "whatsapp">,
  ch: "email" | "whatsapp"
): boolean {
  return channels.includes(ch);
}

function toggleChannel(
  channels: Array<"email" | "whatsapp">,
  ch: "email" | "whatsapp"
): Array<"email" | "whatsapp"> {
  return channels.includes(ch)
    ? channels.filter((c) => c !== ch)
    : [...channels, ch];
}

// ── Form Component ─────────────────────────────────────────────────

function AgentForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormData;
  onSave: (data: FormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormData>(initial);

  function setField<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setReportField<K extends keyof FormData["permissions"]["reports"]>(
    key: K,
    value: FormData["permissions"]["reports"][K]
  ) {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        reports: { ...f.permissions.reports, [key]: value },
      },
    }));
  }

  function setOrderField<K extends keyof FormData["permissions"]["orders"]>(
    key: K,
    value: boolean
  ) {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        orders: { ...f.permissions.orders, [key]: value },
      },
    }));
  }

  function setQueryField<K extends keyof FormData["permissions"]["queries"]>(
    key: K,
    value: boolean
  ) {
    setForm((f) => ({
      ...f,
      permissions: {
        ...f.permissions,
        queries: { ...f.permissions.queries, [key]: value },
      },
    }));
  }

  return (
    <Card className="bg-card border-[oklch(0.65_0.15_50)]/30 mb-6">
      <CardContent className="p-5 space-y-5">
        {/* Row 1: name / email / phone / role */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Name <span className="text-[oklch(0.45_0.08_15)]">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.15_50)] transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="email@example.com"
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.15_50)] transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Phone
            </label>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="+91..."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.15_50)] transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Role
            </label>
            <select
              value={form.role}
              onChange={(e) => setField("role", e.target.value as AgentRoleName)}
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-[oklch(0.65_0.15_50)] transition-colors"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: permissions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Report channels + schedule */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Report Channels
            </p>
            <div className="space-y-1.5">
              {(["email", "whatsapp"] as const).map((ch) => (
                <label
                  key={ch}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={channelHas(
                      form.permissions.reports.channels,
                      ch
                    )}
                    onChange={() =>
                      setReportField(
                        "channels",
                        toggleChannel(form.permissions.reports.channels, ch)
                      )
                    }
                    className="w-3.5 h-3.5 rounded border-border accent-[oklch(0.65_0.15_50)]"
                  />
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {ch === "email" ? (
                      <Mail className="w-3.5 h-3.5" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5" />
                    )}
                    {ch === "email" ? "Email" : "WhatsApp"}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mt-3">
              Report Schedule
            </p>
            <div className="space-y-1.5">
              {(
                [
                  { key: "daily", label: "Daily" },
                  { key: "monday", label: "Monday" },
                  { key: "friday", label: "Friday" },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.reports[key]}
                    onChange={(e) => setReportField(key, e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border accent-[oklch(0.65_0.15_50)]"
                  />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Order permissions */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Order Permissions
            </p>
            <div className="space-y-1.5">
              {(
                [
                  { key: "canPlace", label: "Can Place Orders" },
                  { key: "canApprove", label: "Can Approve Orders" },
                  { key: "canCancel", label: "Can Cancel Orders" },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.orders[key]}
                    onChange={(e) => setOrderField(key, e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border accent-[oklch(0.65_0.15_50)]"
                  />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Query permissions + Active toggle */}
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Query Permissions
            </p>
            <div className="space-y-1.5">
              {(
                [
                  { key: "canQueryCustomers", label: "Query Customers" },
                  { key: "canQueryMetrics", label: "Query Metrics" },
                  { key: "canQueryFinancials", label: "Query Financials" },
                ] as const
              ).map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.queries[key]}
                    onChange={(e) => setQueryField(key, e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-border accent-[oklch(0.65_0.15_50)]"
                  />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {label}
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
                Status
              </p>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isActive}
                  onClick={() => setField("isActive", !form.isActive)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    form.isActive
                      ? "bg-[oklch(0.65_0.15_50)]"
                      : "bg-border"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      form.isActive ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {form.isActive ? "Active" : "Inactive"}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1 border-t border-border/50">
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-[oklch(0.65_0.15_50)] text-white rounded-md hover:bg-[oklch(0.60_0.15_50)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Check className="w-4 h-4" />
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────

export default function AgentRolesPage() {
  const [agents, setAgents] = useState<AgentRoleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAgents(data);
    } catch {
      setError("Failed to load agent roles.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function handleCreate(data: FormData) {
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      setShowForm(false);
      await fetchAgents();
    } catch {
      setError("Failed to create agent role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, data: FormData) {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update");
      setEditingId(null);
      await fetchAgents();
    } catch {
      setError("Failed to update agent role.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this agent role?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      await fetchAgents();
    } catch {
      setError("Failed to delete agent role.");
    } finally {
      setDeletingId(null);
    }
  }

  function agentToForm(a: AgentRoleDoc): FormData {
    return {
      name: a.name,
      email: a.email ?? "",
      phone: a.phone ?? "",
      role: a.role,
      isActive: a.isActive,
      permissions: {
        reports: {
          daily: a.permissions.reports.daily,
          monday: a.permissions.reports.monday,
          friday: a.permissions.reports.friday,
          channels: [...a.permissions.reports.channels],
        },
        orders: { ...a.permissions.orders },
        queries: { ...a.permissions.queries },
      },
    };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Shield className="w-5 h-5 text-[oklch(0.65_0.15_50)]" />
            <h1 className="text-2xl font-light text-foreground tracking-tight">
              Agent Roles
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage WhatsApp and email report recipients
          </p>
        </div>
        {!showForm && editingId === null && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[oklch(0.65_0.15_50)] text-white rounded-md hover:bg-[oklch(0.60_0.15_50)] transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Add Agent
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 rounded-md bg-[oklch(0.45_0.08_15)]/10 border border-[oklch(0.45_0.08_15)]/20 text-sm text-[oklch(0.45_0.08_15)] flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-3 hover:opacity-70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <AgentForm
          initial={EMPTY_FORM}
          onSave={handleCreate}
          onCancel={() => setShowForm(false)}
          saving={saving}
        />
      )}

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg bg-secondary/40 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && agents.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-12 text-center">
            <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">
              No agent roles configured yet
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Add agents to configure report distribution and permissions
            </p>
          </CardContent>
        </Card>
      )}

      {/* Agent table */}
      {!loading && agents.length > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3 font-medium">Name</th>
                    <th className="px-5 py-3 font-medium">Email</th>
                    <th className="px-5 py-3 font-medium">Phone</th>
                    <th className="px-5 py-3 font-medium">Role</th>
                    <th className="px-5 py-3 font-medium">Channels</th>
                    <th className="px-5 py-3 font-medium">Active</th>
                    <th className="px-5 py-3 font-medium w-24">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) =>
                    editingId === agent._id ? (
                      <tr key={agent._id}>
                        <td colSpan={7} className="p-0">
                          <div className="border-b border-border">
                            <AgentForm
                              initial={agentToForm(agent)}
                              onSave={(data) => handleUpdate(agent._id, data)}
                              onCancel={() => setEditingId(null)}
                              saving={saving}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={agent._id}
                        className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-medium text-foreground">
                          {agent.name}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                          {agent.email || (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs">
                          {agent.phone || (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_BADGE[agent.role]}`}
                          >
                            {agent.role}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            {agent.permissions.reports.channels.includes(
                              "email"
                            ) && (
                              <span
                                title="Email"
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-secondary text-muted-foreground"
                              >
                                <Mail className="w-3 h-3" /> Email
                              </span>
                            )}
                            {agent.permissions.reports.channels.includes(
                              "whatsapp"
                            ) && (
                              <span
                                title="WhatsApp"
                                className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-[oklch(0.55_0.08_200)]/10 text-[oklch(0.55_0.08_200)]"
                              >
                                <MessageSquare className="w-3 h-3" /> WA
                              </span>
                            )}
                            {agent.permissions.reports.channels.length ===
                              0 && (
                              <span className="text-[11px] text-muted-foreground/40">
                                None
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${
                              agent.isActive
                                ? "bg-[oklch(0.65_0.15_50)]/10 text-[oklch(0.65_0.15_50)]"
                                : "bg-secondary text-muted-foreground"
                            }`}
                          >
                            {agent.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setShowForm(false);
                                setEditingId(agent._id);
                              }}
                              title="Edit"
                              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(agent._id)}
                              disabled={deletingId === agent._id}
                              title="Delete"
                              className="p-1.5 rounded hover:bg-[oklch(0.45_0.08_15)]/10 text-muted-foreground hover:text-[oklch(0.45_0.08_15)] disabled:opacity-40 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
