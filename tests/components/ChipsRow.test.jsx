// The chips strip under the pitch (S30/S31): it must hide chips the commissioner
// turned off, show each chip's state in words, and only offer the Joker shortcut
// while the Joker can still be played.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChipsRow from '../../src/components/squad/ChipsRow';
import { useChips } from '../../src/hooks/useChips';

vi.mock('../../src/hooks/useChips', () => ({ useChips: vi.fn() }));

function chipsState(statuses, extra = {}) {
  const chips = Object.fromEntries(Object.entries(statuses).map(([id, status]) => [id, { status }]));
  useChips.mockReturnValue({ state: { chips }, loading: false, error: null, ...extra });
}

beforeEach(() => {
  useChips.mockReset();
});

describe('ChipsRow', () => {
  it('shows every chip with its state in words', () => {
    chipsState({ triple_captain: 'available', joker: 'used', max_cap: 'active' });
    render(<ChipsRow leagueId="l1" userId="u1" onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Triple Captain chip, Ready' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joker chip, Used' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Max Cap chip, Active' })).toBeInTheDocument();
  });

  it('hides a chip the commissioner turned off', () => {
    chipsState({ triple_captain: 'disabled', joker: 'available', max_cap: 'available' });
    render(<ChipsRow leagueId="l1" userId="u1" onOpen={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Triple Captain/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Joker chip, Ready' })).toBeInTheDocument();
  });

  it('renders nothing when every chip is off', () => {
    chipsState({ triple_captain: 'disabled', joker: 'disabled', max_cap: 'disabled' });
    const { container } = render(<ChipsRow leagueId="l1" userId="u1" onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the chips are still loading', () => {
    useChips.mockReturnValue({ state: null, loading: true, error: null });
    const { container } = render(<ChipsRow leagueId="l1" userId="u1" onOpen={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens the chips panel from a pill', async () => {
    chipsState({ triple_captain: 'available', joker: 'available', max_cap: 'available' });
    const onOpen = vi.fn();
    render(<ChipsRow leagueId="l1" userId="u1" onOpen={onOpen} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Max Cap chip, Ready' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('offers "Pick your Joker" while the Joker is unused', async () => {
    chipsState({ triple_captain: 'available', joker: 'available', max_cap: 'available' });
    const onJoker = vi.fn();
    render(<ChipsRow leagueId="l1" userId="u1" onOpen={vi.fn()} onJoker={onJoker} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Pick your Joker' }));
    expect(onJoker).toHaveBeenCalledTimes(1);
  });

  it('says "Change your Joker" once one is picked this round', () => {
    chipsState({ triple_captain: 'available', joker: 'active', max_cap: 'available' });
    render(<ChipsRow leagueId="l1" userId="u1" onOpen={vi.fn()} onJoker={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Change your Joker' })).toBeInTheDocument();
  });

  it('drops the Joker shortcut once the Joker is used', () => {
    chipsState({ triple_captain: 'available', joker: 'used', max_cap: 'available' });
    render(<ChipsRow leagueId="l1" userId="u1" onOpen={vi.fn()} onJoker={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /your Joker/ })).not.toBeInTheDocument();
  });
});
