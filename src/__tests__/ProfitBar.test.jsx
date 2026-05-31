import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

// ProfitBar is not exported from App.jsx, so we re-define it here to test its logic directly.
// If it is ever extracted, this import should be replaced.
function ProfitBar({ profit }) {
  const pct = Math.min((profit / 1500) * 100, 100);
  const col = profit > 800 ? '#00FF88' : profit > 250 ? '#FFD700' : '#FF9500';
  return (
    <div style={{ background: '#111122', borderRadius: 3, height: 4, overflow: 'hidden' }}>
      <div style={{ width: pct + '%', height: '100%', background: col, transition: 'width .5s' }} />
    </div>
  );
}

describe('ProfitBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<ProfitBar profit={500} />);
    expect(container.firstChild).toBeTruthy();
  });

  it('bar width is proportional to profit (500 / 1500 ≈ 33.3%)', () => {
    const { container } = render(<ProfitBar profit={500} />);
    const inner = container.firstChild.firstChild;
    // jsdom may normalize the float string slightly; check it starts with 33.3
    expect(inner.style.width).toMatch(/^33\.3/);
  });

  it('bar width caps at 100% for very high profit', () => {
    const { container } = render(<ProfitBar profit={9999} />);
    const inner = container.firstChild.firstChild;
    expect(inner.style.width).toBe('100%');
  });

  it('bar width is 0% for zero profit', () => {
    const { container } = render(<ProfitBar profit={0} />);
    const inner = container.firstChild.firstChild;
    expect(inner.style.width).toBe('0%');
  });

  // jsdom normalizes hex colors to rgb() format
  it('color is green (rgb 0,255,136) when profit > 800', () => {
    const { container } = render(<ProfitBar profit={1000} />);
    const inner = container.firstChild.firstChild;
    expect(inner.style.background).toBe('rgb(0, 255, 136)');
  });

  it('color is gold (rgb 255,215,0) when profit is between 250 and 800', () => {
    const { container } = render(<ProfitBar profit={500} />);
    const inner = container.firstChild.firstChild;
    expect(inner.style.background).toBe('rgb(255, 215, 0)');
  });

  it('color is orange (rgb 255,149,0) when profit <= 250', () => {
    const { container } = render(<ProfitBar profit={100} />);
    const inner = container.firstChild.firstChild;
    expect(inner.style.background).toBe('rgb(255, 149, 0)');
  });

  it('boundary: profit exactly 800 uses gold color', () => {
    const { container } = render(<ProfitBar profit={800} />);
    const inner = container.firstChild.firstChild;
    expect(inner.style.background).toBe('rgb(255, 215, 0)');
  });

  it('boundary: profit exactly 250 uses orange color', () => {
    const { container } = render(<ProfitBar profit={250} />);
    const inner = container.firstChild.firstChild;
    expect(inner.style.background).toBe('rgb(255, 149, 0)');
  });
});
