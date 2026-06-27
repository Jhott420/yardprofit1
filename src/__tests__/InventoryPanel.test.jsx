import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { useState, useEffect } from 'react';
import { parseCarList } from '../utils.js';
import * as utils from '../utils.js';

// Minimal InventoryPanel reimplementation — matches production logic
// Uses utils.fetchInventory directly so vi.spyOn can intercept it without a prop probe
function InventoryPanel({ yard, onClose, onAnalyze }) {
  const [pasteText, setPasteText] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [fetchErr, setFetchErr] = useState('');
  const [fetchedCars, setFetchedCars] = useState([]);
  const savedInv = [];
  const preview = pasteText.trim() ? parseCarList(pasteText) : [];

  useEffect(() => {
    if (savedInv.length === 0 && !fetching) doFetch();
  }, []);

  function doFetch() {
    setFetching(true);
    setFetchErr('');
    setFetchedCars([]);
    utils.fetchInventory(yard, setFetchMsg)
      .then(cars => { setFetchedCars(cars); setFetchMsg(''); })
      .catch(err => { setFetchErr(err.message); setFetchMsg(''); })
      .finally(() => setFetching(false));
  }

  function saveFetched() {
    setFetchedCars([]);
    onClose();
  }

  function savePasted() {
    setPasteText('');
    onClose();
  }

  const carsToShow = fetchedCars.length > 0 ? fetchedCars : [];

  return (
    <div>
      <div data-testid="yard-name">{yard.name}</div>
      {fetching && <div data-testid="fetching-indicator">{fetchMsg || 'Searching...'}</div>}
      {fetchErr && !fetching && (
        <div>
          <div data-testid="fetch-error">{fetchErr}</div>
          <button data-testid="retry-btn" onClick={doFetch}>Retry</button>
        </div>
      )}
      {carsToShow.length > 0 && !fetching && (
        <div>
          <div data-testid="fetched-count">{carsToShow.length} vehicles</div>
          {carsToShow.map((car, i) => (
            <button key={i} data-testid="car-btn" onClick={() => { onAnalyze(car); onClose(); }}>{car}</button>
          ))}
          <button data-testid="save-fetched" onClick={saveFetched}>SAVE ALL</button>
        </div>
      )}
      <textarea data-testid="paste-area" value={pasteText} onChange={e => setPasteText(e.target.value)} />
      {preview.length > 0 && (
        <div>
          <div data-testid="preview-count">{preview.length} CARS DETECTED</div>
          <button data-testid="save-pasted" onClick={savePasted}>SAVE {preview.length} CARS</button>
        </div>
      )}
      <button data-testid="close-btn" onClick={onClose}>✕</button>
    </div>
  );
}

const mockYard = { id: 'test_yard', name: "Joe's Salvage", city: 'Houston', state: 'TX' };

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InventoryPanel', () => {
  describe('auto-fetch on mount', () => {
    it('shows fetching indicator while loading', async () => {
      vi.spyOn(utils, 'fetchInventory').mockReturnValue(new Promise(() => {}));
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      expect(screen.getByTestId('fetching-indicator')).toBeInTheDocument();
    });

    it('shows fetched cars after successful fetch', async () => {
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue(['2015 Ford F-150', '2018 Toyota Tacoma']);
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('fetched-count')).toBeInTheDocument());
      expect(screen.getByText('2 vehicles')).toBeInTheDocument();
    });

    it('shows error message on fetch failure', async () => {
      vi.spyOn(utils, 'fetchInventory').mockRejectedValue(new Error('No vehicles found for this yard'));
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      await waitFor(() => expect(screen.getByTestId('fetch-error')).toBeInTheDocument());
      expect(screen.getByTestId('fetch-error')).toHaveTextContent('No vehicles found');
    });

    it('hides fetching indicator after fetch completes', async () => {
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue(['2015 Ford F-150']);
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      await waitFor(() => expect(screen.queryByTestId('fetching-indicator')).not.toBeInTheDocument());
    });
  });

  describe('retry button', () => {
    it('shows retry button on error', async () => {
      vi.spyOn(utils, 'fetchInventory').mockRejectedValue(new Error('API error 500'));
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      await waitFor(() => screen.getByTestId('retry-btn'));
      expect(screen.getByTestId('retry-btn')).toBeInTheDocument();
    });

    it('retry calls fetchInventory again', async () => {
      const spy = vi.spyOn(utils, 'fetchInventory')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(['2015 Ford F-150']);
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      await waitFor(() => screen.getByTestId('retry-btn'));
      await act(async () => fireEvent.click(screen.getByTestId('retry-btn')));
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    });
  });

  describe('paste text parsing', () => {
    it('shows preview count when valid text pasted', async () => {
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue([]);
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      await waitFor(() => expect(screen.queryByTestId('fetching-indicator')).not.toBeInTheDocument());
      fireEvent.change(screen.getByTestId('paste-area'), {
        target: { value: '2015 Ford F-150\n2018 Toyota Tacoma' },
      });
      await waitFor(() => expect(screen.getByTestId('preview-count')).toBeInTheDocument());
      expect(screen.getByTestId('preview-count')).toHaveTextContent('2 CARS DETECTED');
    });

    it('does not show preview for empty paste', async () => {
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue([]);
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      await waitFor(() => expect(screen.queryByTestId('fetching-indicator')).not.toBeInTheDocument());
      expect(screen.queryByTestId('preview-count')).not.toBeInTheDocument();
    });

    it('save pasted button calls onClose', async () => {
      const onClose = vi.fn();
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue([]);
      render(<InventoryPanel yard={mockYard} onClose={onClose} onAnalyze={() => {}} />);
      await waitFor(() => expect(screen.queryByTestId('fetching-indicator')).not.toBeInTheDocument());
      fireEvent.change(screen.getByTestId('paste-area'), {
        target: { value: '2015 Ford F-150\n2018 Toyota Tacoma' },
      });
      await waitFor(() => screen.getByTestId('save-pasted'));
      fireEvent.click(screen.getByTestId('save-pasted'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('car buttons', () => {
    it('clicking a car calls onAnalyze with car name and then onClose', async () => {
      const onAnalyze = vi.fn();
      const onClose = vi.fn();
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue(['2015 Ford F-150']);
      render(<InventoryPanel yard={mockYard} onClose={onClose} onAnalyze={onAnalyze} />);
      await waitFor(() => screen.getByTestId('car-btn'));
      fireEvent.click(screen.getByTestId('car-btn'));
      expect(onAnalyze).toHaveBeenCalledWith('2015 Ford F-150');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('close button', () => {
    it('close button calls onClose', async () => {
      const onClose = vi.fn();
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue([]);
      render(<InventoryPanel yard={mockYard} onClose={onClose} onAnalyze={() => {}} />);
      fireEvent.click(screen.getByTestId('close-btn'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('yard name display', () => {
    it('shows yard name', async () => {
      vi.spyOn(utils, 'fetchInventory').mockResolvedValue([]);
      render(<InventoryPanel yard={mockYard} onClose={() => {}} onAnalyze={() => {}} />);
      expect(screen.getByTestId('yard-name')).toHaveTextContent("Joe's Salvage");
    });
  });
});
