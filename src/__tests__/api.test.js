import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchInventory, findYardsNearLocation } from '../utils.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(body, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

describe('fetchInventory', () => {
  const yard = { id: 'test', name: "Joe's Salvage", city: 'Houston', state: 'TX', inventory: 'https://example.com/inv' };

  it('calls onStatus with yard name', async () => {
    mockFetch({
      content: [{ type: 'text', text: '2015 Ford F-150\n2018 Toyota Tacoma' }],
    });
    const statuses = [];
    await fetchInventory(yard, s => statuses.push(s));
    expect(statuses[0]).toContain("Joe's Salvage");
  });

  it('calls onStatus with "Parsing results..." after success', async () => {
    mockFetch({
      content: [{ type: 'text', text: '2015 Ford F-150\n2018 Toyota Tacoma' }],
    });
    const statuses = [];
    await fetchInventory(yard, s => statuses.push(s));
    expect(statuses).toContain('Parsing results...');
  });

  it('returns parsed car list on success', async () => {
    mockFetch({
      content: [{ type: 'text', text: '2015 Ford F-150\n2018 Toyota Tacoma' }],
    });
    const result = await fetchInventory(yard, () => {});
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Ford');
  });

  it('throws "API error <status>" on non-200 response', async () => {
    mockFetch({}, 500);
    await expect(fetchInventory(yard, () => {})).rejects.toThrow('API error 500');
  });

  it('throws when no vehicles are parsed from response', async () => {
    mockFetch({
      content: [{ type: 'text', text: 'No inventory available at this time.' }],
    });
    await expect(fetchInventory(yard, () => {})).rejects.toThrow('No vehicles found for this yard');
  });

  it('concatenates multiple text blocks', async () => {
    mockFetch({
      content: [
        { type: 'text', text: '2015 Ford F-150\n' },
        { type: 'text', text: '2018 Toyota Tacoma' },
      ],
    });
    const result = await fetchInventory(yard, () => {});
    expect(result).toHaveLength(2);
  });

  it('ignores non-text content blocks', async () => {
    mockFetch({
      content: [
        { type: 'tool_use', input: {} },
        { type: 'text', text: '2015 Ford F-150' },
      ],
    });
    const result = await fetchInventory(yard, () => {});
    expect(result).toHaveLength(1);
  });

  it('handles missing content array gracefully', async () => {
    mockFetch({ content: [] });
    await expect(fetchInventory(yard, () => {})).rejects.toThrow('No vehicles found');
  });

  it('sends POST to Anthropic API', async () => {
    mockFetch({ content: [{ type: 'text', text: '2015 Ford F-150' }] });
    await fetchInventory(yard, () => {});
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('findYardsNearLocation', () => {
  const lat = 29.7604;
  const lng = -95.3698;

  function mockYardResponse(lines) {
    mockFetch({
      content: [{ type: 'text', text: lines.join('\n') }],
    });
  }

  it('calls onStatus with "Finding yards near you..."', async () => {
    mockYardResponse(['LKQ Houston | 1234 Main St, Houston, TX | 713-555-0100 | https://lkq.com | u-pull']);
    const statuses = [];
    await findYardsNearLocation(lat, lng, '', s => statuses.push(s));
    expect(statuses[0]).toBe('Finding yards near you...');
  });

  it('calls onStatus with "Parsing results..." after success', async () => {
    mockYardResponse(['LKQ Houston | 1234 Main St, Houston, TX | 713-555-0100 | https://lkq.com | u-pull']);
    const statuses = [];
    await findYardsNearLocation(lat, lng, '', s => statuses.push(s));
    expect(statuses).toContain('Parsing results...');
  });

  it('parses pipe-delimited yard response', async () => {
    mockYardResponse(['LKQ Houston | 1234 Main St, Houston, TX | 713-555-0100 | https://lkq.com | u-pull']);
    const yards = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yards).toHaveLength(1);
    expect(yards[0].name).toBe('LKQ Houston');
    expect(yards[0].address).toBe('1234 Main St, Houston, TX');
    expect(yards[0].phone).toBe('713-555-0100');
  });

  it('assigns correct type for u-pull', async () => {
    mockYardResponse(['Joe Pull | 123 St | 555-1234 | | u-pull']);
    const [yard] = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yard.type).toBe('U-Pull');
  });

  it('assigns correct type for auction', async () => {
    mockYardResponse(['City Auction | 123 St | 555-1234 | | auction']);
    const [yard] = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yard.type).toBe('Auction');
  });

  it('assigns correct type for full-service', async () => {
    mockYardResponse(['Full Service Auto | 123 St | 555-1234 | | full-service']);
    const [yard] = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yard.type).toBe('Full-Service');
  });

  it('assigns Salvage for unknown type', async () => {
    mockYardResponse(['Joes Parts | 123 St | 555-1234 | | salvage']);
    const [yard] = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yard.type).toBe('Salvage');
  });

  it('applies detectMulti to set priceMulti', async () => {
    mockYardResponse(['Copart Houston | 123 St | 555-1234 | | auction']);
    const [yard] = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yard.priceMulti).toBe(0.65);
  });

  it('sets isFound: true on each yard', async () => {
    mockYardResponse(['LKQ Houston | 1234 Main St | 555-0100 | | u-pull']);
    const [yard] = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yard.isFound).toBe(true);
  });

  it('throws on non-200 response', async () => {
    mockFetch({}, 503);
    await expect(findYardsNearLocation(lat, lng, '', () => {})).rejects.toThrow('Search failed: 503');
  });

  it('throws when no yards parsed', async () => {
    mockFetch({ content: [{ type: 'text', text: 'Sorry, no results found.' }] });
    await expect(findYardsNearLocation(lat, lng, '', () => {})).rejects.toThrow('No yards found nearby');
  });

  it('skips lines without pipe separator', async () => {
    mockYardResponse([
      'No pipe here just plain text',
      'LKQ Houston | 1234 Main St | 555-0100 | | u-pull',
    ]);
    const yards = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yards).toHaveLength(1);
  });

  it('skips header row named "NAME"', async () => {
    mockYardResponse([
      'NAME | ADDRESS | PHONE | WEBSITE | TYPE',
      'Joe Auto | 123 St | 555-1234 | | salvage',
    ]);
    const yards = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yards).toHaveLength(1);
    expect(yards[0].name).toBe('Joe Auto');
  });

  it('strips leading number prefix from yard name', async () => {
    mockYardResponse(['1. LKQ Houston | 1234 Main St | 555-0100 | | u-pull']);
    const [yard] = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yard.name).toBe('LKQ Houston');
  });

  it('handles multiple yards', async () => {
    mockYardResponse([
      'Yard One | 1 Main St | 555-0001 | | salvage',
      'Yard Two | 2 Oak Ave | 555-0002 | | u-pull',
      'Yard Three | 3 Pine Rd | 555-0003 | | full-service',
    ]);
    const yards = await findYardsNearLocation(lat, lng, '', () => {});
    expect(yards).toHaveLength(3);
  });
});
