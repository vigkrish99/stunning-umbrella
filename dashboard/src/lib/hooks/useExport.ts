"use client";

/**
 * Extract filename from Content-Disposition header, or return a fallback.
 */
function getFilenameFromResponse(
  response: Response,
  fallback: string
): string {
  const disposition = response.headers.get("Content-Disposition");
  if (disposition) {
    const match = disposition.match(/filename="?([^";\n]+)"?/);
    if (match?.[1]) return match[1];
  }
  return fallback;
}

/**
 * Trigger a browser file download from a blob response.
 * Uses a deferred revokeObjectURL to ensure the browser has time
 * to initiate the download before the blob URL is released.
 */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Defer cleanup so the browser can start the download before the URL is revoked
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

export async function exportCSV(
  type: string,
  filters?: Record<string, string>
) {
  const params = new URLSearchParams({ type, ...filters });
  const response = await fetch(`/api/export/csv?${params}`);
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`CSV export failed (${response.status}): ${errBody}`);
  }

  const blob = await response.blob();
  const fallbackName = `helix-gases-${type}-${new Date().toISOString().split("T")[0]}.csv`;
  const filename = getFilenameFromResponse(response, fallbackName);
  triggerBlobDownload(blob, filename);
}

export async function exportPDF(
  type: string,
  filters?: Record<string, string>
) {
  const params = new URLSearchParams({ type, ...filters });
  const response = await fetch(`/api/export/pdf?${params}`);
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`PDF export failed (${response.status}): ${errBody}`);
  }

  const blob = await response.blob();
  const fallbackName = `helix-gases-${type}-${new Date().toISOString().split("T")[0]}.pdf`;
  const filename = getFilenameFromResponse(response, fallbackName);
  triggerBlobDownload(blob, filename);
}
