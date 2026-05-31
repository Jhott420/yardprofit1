import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App.jsx';

beforeEach(() => {
  sessionStorage.clear();
  // Suppress fetch calls to Anthropic API during tests
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: () => Promise.resolve({}),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('App — home screen', () => {
  it('renders the YARDPROFIT heading', () => {
    render(<App />);
    expect(screen.getByText('⚙ YARDPROFIT')).toBeInTheDocument();
  });

  it('renders the GO button', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'GO' })).toBeInTheDocument();
  });

  it('shows trial count on initial load', () => {
    render(<App />);
    expect(screen.getByText(/3 free lookup/i)).toBeInTheDocument();
  });

  it('shows "3 LEFT" in nav when no trials used', () => {
    render(<App />);
    expect(screen.getByText('3 LEFT')).toBeInTheDocument();
  });
});

describe('App — vehicle search and results', () => {
  it('navigates to results screen after a search', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/any car/i);
    fireEvent.change(input, { target: { value: '2018 Honda Accord' } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    await waitFor(() => expect(screen.getByText(/2018 Honda Accord/i)).toBeInTheDocument());
  });

  it('shows total profit on results screen', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/any car/i);
    fireEvent.change(input, { target: { value: '2018 Toyota Camry' } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    await waitFor(() => expect(screen.getByText(/TOTAL PROFIT/i)).toBeInTheDocument());
  });

  it('shows parts count on results screen', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/any car/i);
    fireEvent.change(input, { target: { value: '2018 Toyota Camry' } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    // "92 parts" appears in multiple nodes; verify at least one exists
    await waitFor(() => expect(screen.getAllByText(/parts/).length).toBeGreaterThan(0));
  });

  it('increments trial count after each search', async () => {
    render(<App />);
    const input = screen.getByPlaceholderText(/any car/i);
    fireEvent.change(input, { target: { value: '2018 Honda Civic' } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    await waitFor(() => screen.getByText(/2 LEFT/i));
    expect(screen.getByText('2 LEFT')).toBeInTheDocument();
  });

  it('clicking quick-try button navigates to results', async () => {
    render(<App />);
    const supraBtn = screen.getByRole('button', { name: '1998 Supra TT' });
    fireEvent.click(supraBtn);
    await waitFor(() => expect(screen.getByText(/Supra/i)).toBeInTheDocument());
  });

  it('allows searching from results screen', async () => {
    render(<App />);
    fireEvent.change(screen.getByPlaceholderText(/any car/i), { target: { value: '2015 Mustang' } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    await waitFor(() => screen.getByText(/TOTAL PROFIT/i));
    const resultsInput = screen.getByPlaceholderText(/Search any other vehicle/i);
    fireEvent.change(resultsInput, { target: { value: '2019 Camry' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'GO' })[0]);
    await waitFor(() => expect(screen.getByText(/Camry/i)).toBeInTheDocument());
  });
});

describe('App — trial gate', () => {
  it('shows paywall after 3 searches', async () => {
    sessionStorage.setItem('yp_t', '3');
    render(<App />);
    const input = screen.getByPlaceholderText(/any car/i);
    fireEvent.change(input, { target: { value: '2018 Accord' } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    await waitFor(() => expect(screen.getByText(/FREE TRIAL ENDED/i)).toBeInTheDocument());
  });

  it('shows UPGRADE button when trial is done', () => {
    sessionStorage.setItem('yp_t', '3');
    render(<App />);
    expect(screen.getByText('⚠ UPGRADE')).toBeInTheDocument();
  });

  it('shows UPGRADE badge (not trial count) when trial exhausted', () => {
    sessionStorage.setItem('yp_t', '3');
    render(<App />);
    // When trialDone=true the button shows "⚠ UPGRADE", not "0 LEFT"
    expect(screen.getByText('⚠ UPGRADE')).toBeInTheDocument();
  });

  it('pro users bypass trial gate and see PRO badge', () => {
    sessionStorage.setItem('yp_s', 'true');
    sessionStorage.setItem('yp_t', '99');
    render(<App />);
    expect(screen.getByText('✓ PRO')).toBeInTheDocument();
  });

  it('pro user can still search after trial limit', async () => {
    sessionStorage.setItem('yp_s', 'true');
    sessionStorage.setItem('yp_t', '99');
    render(<App />);
    const input = screen.getByPlaceholderText(/any car/i);
    fireEvent.change(input, { target: { value: '2018 Honda Civic' } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    await waitFor(() => expect(screen.queryByText(/FREE TRIAL ENDED/i)).not.toBeInTheDocument());
    expect(screen.getByText(/TOTAL PROFIT/i)).toBeInTheDocument();
  });
});

describe('App — subscription unlock screen', () => {
  it('shows sub screen with PRO pricing when navigated via header button', async () => {
    render(<App />);
    // Click "3 LEFT" button to go to sub screen
    fireEvent.click(screen.getByText('3 LEFT'));
    await waitFor(() => expect(screen.getByText(/Go Pro/i)).toBeInTheDocument());
  });

  it('"I\'VE PAID" button unlocks pro access', async () => {
    render(<App />);
    fireEvent.click(screen.getByText('3 LEFT'));
    await waitFor(() => screen.getByText(/I'VE PAID/i));
    fireEvent.click(screen.getByText(/I'VE PAID/i));
    await waitFor(() => expect(screen.getByText('✓ PRO')).toBeInTheDocument());
  });
});

describe('App — stripe redirect auto-unlock', () => {
  it('auto-unlocks when ?paid=1 is in URL', () => {
    const orig = window.location.search;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?paid=1', pathname: '/' },
      writable: true,
    });
    window.history.replaceState = vi.fn();
    render(<App />);
    expect(screen.getByText('✓ PRO')).toBeInTheDocument();
    Object.defineProperty(window, 'location', { value: { search: orig }, writable: true });
  });
});

describe('App — yards screen', () => {
  it('navigates to yards screen via YARDS button', () => {
    render(<App />);
    fireEvent.click(screen.getByText('🏭 YARDS'));
    expect(screen.getByText('YARD MANAGER')).toBeInTheDocument();
  });

  it('shows chain yards list', () => {
    render(<App />);
    fireEvent.click(screen.getByText('🏭 YARDS'));
    expect(screen.getByText('LKQ Pick Your Part')).toBeInTheDocument();
  });

  it('can add a custom yard', () => {
    render(<App />);
    fireEvent.click(screen.getByText('🏭 YARDS'));
    const nameInput = screen.getByPlaceholderText("Joe's Auto Salvage");
    fireEvent.change(nameInput, { target: { value: 'My Test Yard' } });
    fireEvent.click(screen.getByText('ADD YARD +'));
    expect(screen.getByText('My Test Yard')).toBeInTheDocument();
  });

  it('navigates back to home from yards screen', () => {
    render(<App />);
    fireEvent.click(screen.getByText('🏭 YARDS'));
    fireEvent.click(screen.getByText(/← BACK/i));
    expect(screen.getByText(/KNOW WHAT EVERY/i)).toBeInTheDocument();
  });
});

describe('App — results screen interactions', () => {
  async function getToResults(vehicle = '2018 Toyota Camry') {
    render(<App />);
    const input = screen.getByPlaceholderText(/any car/i);
    fireEvent.change(input, { target: { value: vehicle } });
    fireEvent.click(screen.getByRole('button', { name: 'GO' }));
    await waitFor(() => screen.getByText(/TOTAL PROFIT/i));
  }

  it('sort buttons exist', async () => {
    await getToResults();
    expect(screen.getByRole('button', { name: /profit/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ebay/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /demand/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /name/i })).toBeInTheDocument();
  });

  it('navigates back to home via logo click', async () => {
    await getToResults();
    fireEvent.click(screen.getByText('⚙ YARDPROFIT'));
    expect(screen.getByText(/KNOW WHAT EVERY/i)).toBeInTheDocument();
  });

  it('shows part count label', async () => {
    await getToResults();
    expect(screen.getAllByText(/parts/).length).toBeGreaterThan(0);
  });
});
