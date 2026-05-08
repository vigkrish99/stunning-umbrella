"use client";

import { useState } from "react";
import {
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Smartphone,
  Server,
  Zap,
} from "lucide-react";

type ProviderStatus = "configured" | "not-configured" | "unknown";

interface CommandRef {
  command: string;
  description: string;
  example: string;
}

const botCommands: CommandRef[] = [
  {
    command: "top 10",
    description: "Top 10 performers by rotation rate",
    example: "top 10",
  },
  {
    command: "at risk",
    description: "Customers with poor or critical performance",
    example: "at risk",
  },
  {
    command: "customer [name]",
    description: "Customer details and rotation summary",
    example: "customer ABC Industries",
  },
  {
    command: "report",
    description: "Daily summary with distribution breakdown",
    example: "report",
  },
  {
    command: "help",
    description: "Show available commands",
    example: "help",
  },
];

function StatusBadge({ status }: { status: ProviderStatus }) {
  if (status === "configured") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[oklch(0.45_0.1_175)]/10 text-[oklch(0.45_0.1_175)]">
        <CheckCircle className="w-3.5 h-3.5" />
        Configured
      </span>
    );
  }
  if (status === "not-configured") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[oklch(0.55_0.12_50)]/10 text-[oklch(0.55_0.12_50)]">
        <XCircle className="w-3.5 h-3.5" />
        Not Configured
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <AlertTriangle className="w-3.5 h-3.5" />
      Unknown
    </span>
  );
}

export default function WhatsAppPage() {
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [sendStatus, setSendStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [sendError, setSendError] = useState("");

  // Provider status - would be fetched from backend in production
  const provider = process.env.NEXT_PUBLIC_WHATSAPP_PROVIDER || "twilio";
  const twilioStatus: ProviderStatus =
    process.env.NEXT_PUBLIC_TWILIO_CONFIGURED === "true"
      ? "configured"
      : "not-configured";
  const watiStatus: ProviderStatus =
    process.env.NEXT_PUBLIC_WATI_CONFIGURED === "true"
      ? "configured"
      : "not-configured";

  const handleTestSend = async () => {
    if (!testPhone || !testMessage) return;

    setSendStatus("sending");
    setSendError("");

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";
      const res = await fetch(`${backendUrl}/api/whatsapp/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: testPhone, message: testMessage }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send test message");
      }

      setSendStatus("sent");
      setTestMessage("");
      setTimeout(() => setSendStatus("idle"), 3000);
    } catch (err) {
      setSendStatus("error");
      setSendError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          WhatsApp Integration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bot configuration, provider status, and message testing
        </p>
      </div>

      {/* Provider Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Twilio Card */}
        <div
          className={`rounded-xl border p-5 ${
            provider === "twilio"
              ? "border-[oklch(0.65_0.15_50)]/30 bg-[oklch(0.65_0.15_50)]/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#0D9DDB]/10 flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-[#0D9DDB]" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Twilio</h3>
                <p className="text-xs text-muted-foreground">
                  Phase 1 - Testing
                </p>
              </div>
            </div>
            <StatusBadge status={twilioStatus} />
          </div>
          {provider === "twilio" && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-[oklch(0.65_0.15_50)]">
              <Zap className="w-3.5 h-3.5" />
              Active Provider
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground space-y-1">
            <p>Sandbox: whatsapp:+14155238886</p>
            <p>Webhooks: /webhooks/twilio</p>
            <p>Status Callback: /webhooks/twilio/status</p>
          </div>
        </div>

        {/* Wati Card */}
        <div
          className={`rounded-xl border p-5 ${
            provider === "wati"
              ? "border-[oklch(0.65_0.15_50)]/30 bg-[oklch(0.65_0.15_50)]/5"
              : "border-border bg-card"
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
                <Server className="w-5 h-5 text-[#25D366]" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Wati</h3>
                <p className="text-xs text-muted-foreground">
                  Phase 2 - Production
                </p>
              </div>
            </div>
            <StatusBadge status={watiStatus} />
          </div>
          {provider === "wati" && (
            <div className="mt-3 flex items-center gap-1.5 text-xs text-[oklch(0.65_0.15_50)]">
              <Zap className="w-3.5 h-3.5" />
              Active Provider
            </div>
          )}
          <div className="mt-3 text-xs text-muted-foreground space-y-1">
            <p>API: Wati REST API v1</p>
            <p>Webhooks: /webhooks/wati</p>
            <p>Interactive lists supported</p>
          </div>
        </div>
      </div>

      {/* Test Message Sender */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Send className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-medium text-foreground">Send Test Message</h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Phone Number (Indian 10-digit)
            </label>
            <input
              type="text"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="9876543210"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.15_50)]/30"
              maxLength={10}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Message
            </label>
            <textarea
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder="Enter test message or bot command (e.g., top 10)"
              rows={3}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[oklch(0.65_0.15_50)]/30 resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestSend}
              disabled={!testPhone || !testMessage || sendStatus === "sending"}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[oklch(0.65_0.15_50)] text-white hover:bg-[oklch(0.60_0.15_50)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
              {sendStatus === "sending" ? "Sending..." : "Send Test"}
            </button>
            {sendStatus === "sent" && (
              <span className="text-sm text-[oklch(0.45_0.1_175)]">
                Message sent successfully
              </span>
            )}
            {sendStatus === "error" && (
              <span className="text-sm text-[oklch(0.55_0.12_25)]">
                {sendError || "Failed to send message"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bot Command Reference */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-medium text-foreground">Bot Commands</h2>
        </div>

        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[oklch(0.20_0.02_260)]">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Command
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Description
                </th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Example
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {botCommands.map((cmd) => (
                <tr
                  key={cmd.command}
                  className="hover:bg-secondary/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-mono">
                      {cmd.command}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {cmd.description}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono text-muted-foreground">
                      {cmd.example}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Message Log Placeholder */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-muted-foreground" />
            <h2 className="font-medium text-foreground">Recent Messages</h2>
          </div>
          <span className="text-xs text-muted-foreground">Last 50 messages</span>
        </div>

        <div className="flex flex-col items-center justify-center py-12 text-center">
          <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            Message log will be available once WhatsApp integration is connected.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Configure your WhatsApp provider credentials to get started.
          </p>
        </div>
      </div>
    </div>
  );
}
