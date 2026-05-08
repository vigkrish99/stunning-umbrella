import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/ui/status-badge';

describe('StatusBadge', () => {
  it('should render Excellent status', () => {
    render(<StatusBadge status="Excellent" />);
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('should render Good status', () => {
    render(<StatusBadge status="Good" />);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('should render Poor status', () => {
    render(<StatusBadge status="Poor" />);
    expect(screen.getByText('Poor')).toBeInTheDocument();
  });

  it('should render Critical status', () => {
    render(<StatusBadge status="Critical" />);
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <StatusBadge status="Excellent" className="my-class" />
    );
    expect(container.firstChild).toHaveClass('my-class');
  });
});
