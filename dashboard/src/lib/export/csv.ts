/**
 * CSV Generation Utility
 * Reusable CSV export with configurable headers, field mapping, and INR formatting.
 */

export function generateCSV(
  headers: string[],
  rows: Array<Record<string, unknown>>,
  fieldMap: Record<string, string>
): string {
  const escapeCSV = (value: unknown): string => {
    const str = String(value ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = headers.map(escapeCSV).join(",");
  const dataRows = rows.map((row) =>
    headers
      .map((header) => {
        const field = fieldMap[header] || header;
        const value = field.includes(".")
          ? field
              .split(".")
              .reduce(
                (obj: Record<string, unknown>, key) =>
                  (obj as Record<string, unknown>)?.[key] as Record<
                    string,
                    unknown
                  >,
                row
              )
          : row[field];
        return escapeCSV(value);
      })
      .join(",")
  );

  return [headerRow, ...dataRows].join("\n");
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export const csvConfigs = {
  customers: {
    headers: [
      "Customer ID",
      "Name",
      "Cylinders",
      "Rotation Rate",
      "Performance",
      "Capital Locked",
    ],
    fieldMap: {
      "Customer ID": "customerId",
      Name: "name",
      Cylinders: "totalCylinders",
      "Rotation Rate": "rotationRate",
      Performance: "performance",
      "Capital Locked": "capitalLocked",
    },
  },
  metrics: {
    headers: [
      "Customer",
      "Period",
      "Avg Holdings",
      "Deliveries",
      "Rotation Rate",
      "Performance",
      "Billing",
    ],
    fieldMap: {
      Customer: "customerName",
      Period: "period.label",
      "Avg Holdings": "cylindersHeld.average",
      Deliveries: "deliveries.totalCylinders",
      "Rotation Rate": "rotationRate",
      Performance: "performance",
      Billing: "billing.totalAmount",
    },
  },
  invoices: {
    headers: [
      "Invoice #",
      "Customer",
      "Date",
      "Amount",
      "Status",
      "Items",
    ],
    fieldMap: {
      "Invoice #": "invoiceNumber",
      Customer: "customerName",
      Date: "date",
      Amount: "amount",
      Status: "status",
      Items: "lineItemCount",
    },
  },
};
