import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { DashboardProvider, useDashboardContext } from "../contexts/DashboardContext";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from "next/navigation";
const mockPathname = usePathname as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  return <DashboardProvider>{children}</DashboardProvider>;
}

describe("DashboardContext", () => {
  it("returns cylinder for / path", () => {
    mockPathname.mockReturnValue("/");
    const { result } = renderHook(() => useDashboardContext(), { wrapper });
    expect(result.current.activeDashboard).toBe("cylinder");
  });

  it("returns cylinder for /cylinder/* paths", () => {
    mockPathname.mockReturnValue("/cylinder/customers");
    const { result } = renderHook(() => useDashboardContext(), { wrapper });
    expect(result.current.activeDashboard).toBe("cylinder");
  });

  it("returns lpg for /lpg/* paths", () => {
    mockPathname.mockReturnValue("/lpg/rotation");
    const { result } = renderHook(() => useDashboardContext(), { wrapper });
    expect(result.current.activeDashboard).toBe("lpg");
  });

  it("returns sales for /sales/* paths", () => {
    mockPathname.mockReturnValue("/sales/unpaid");
    const { result } = renderHook(() => useDashboardContext(), { wrapper });
    expect(result.current.activeDashboard).toBe("sales");
  });

  it("defaults to cylinder for unknown paths", () => {
    mockPathname.mockReturnValue("/settings");
    const { result } = renderHook(() => useDashboardContext(), { wrapper });
    expect(result.current.activeDashboard).toBe("cylinder");
  });
});
