import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from '@/components/ui/kpi-card';

// Mock useCountUp since it uses requestAnimationFrame
vi.mock('@/lib/hooks/useCountUp', () => ({
  useCountUp: (target: number) => target,
}));

describe('KpiCard', () => {
  it('should render label', () => {
    render(<KpiCard label="Total Customers" value={150} />);
    expect(screen.getByText('Total Customers')).toBeInTheDocument();
  });

  it('should render formatted value', () => {
    render(<KpiCard label="Total" value={150} />);
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('should apply custom format function', () => {
    render(
      <KpiCard
        label="Capital"
        value={7500000}
        format={(v) => `₹${(v / 10000000).toFixed(2)} Cr`}
      />
    );
    expect(screen.getByText('₹0.75 Cr')).toBeInTheDocument();
  });

  it('should render subtitle', () => {
    render(<KpiCard label="Test" value={10} subtitle="from last month" />);
    expect(screen.getByText('from last month')).toBeInTheDocument();
  });

  it('should render positive change', () => {
    render(<KpiCard label="Test" value={10} change={{ value: 5, label: 'vs last month' }} />);
    expect(screen.getByText('+5%')).toBeInTheDocument();
    expect(screen.getByText('vs last month')).toBeInTheDocument();
  });

  it('should render negative change', () => {
    render(<KpiCard label="Test" value={10} change={{ value: -3 }} />);
    expect(screen.getByText('-3%')).toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    const MockIcon = (props: React.SVGProps<SVGSVGElement>) => (
      <svg data-testid="mock-icon" {...props} />
    );
    render(<KpiCard label="Test" value={10} icon={MockIcon as never} />);
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <KpiCard label="Test" value={10} className="custom-class" />
    );
    expect(container.firstChild).toHaveClass('custom-class');
  });
});
