import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClubhouseLobby from '../../src/components/clubhouse/ClubhouseLobby';

function setup(overrides = {}) {
  const props = {
    createCircle: vi.fn().mockResolvedValue(undefined),
    joinCircleByCode: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<ClubhouseLobby {...props} />);
  return { user: userEvent.setup(), ...props };
}

describe('ClubhouseLobby (the empty state for someone in no Clubhouse)', () => {
  it('offers both ways in: create and join', () => {
    setup();
    expect(screen.getByRole('heading', { name: /every game you play lives in one room/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Clubhouse' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Join Clubhouse' })).toBeDisabled();
  });

  it('creates a Clubhouse with the trimmed name', async () => {
    const { user, createCircle } = setup();
    await user.click(screen.getByRole('button', { name: 'Create Clubhouse' }));
    const submit = screen.getByRole('button', { name: 'Create Clubhouse' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/friday night crew/i), '  The Lads  ');
    await user.click(submit);
    expect(createCircle).toHaveBeenCalledWith('The Lads');
  });

  it('shows the error when creating fails', async () => {
    const { user } = setup({ createCircle: vi.fn().mockRejectedValue(new Error('NAME_REQUIRED')) });
    await user.click(screen.getByRole('button', { name: 'Create Clubhouse' }));
    await user.type(screen.getByPlaceholderText(/friday night crew/i), 'x');
    await user.click(screen.getByRole('button', { name: 'Create Clubhouse' }));
    expect(await screen.findByText('Please enter a name.')).toBeInTheDocument();
  });

  it('upper-cases the invite code and only allows joining from 6 characters', async () => {
    const { user, joinCircleByCode } = setup();
    const input = screen.getByPlaceholderText('FK-XXXXX');
    await user.type(input, 'fk-ab');
    expect(input).toHaveValue('FK-AB');
    expect(screen.getByRole('button', { name: 'Join Clubhouse' })).toBeDisabled();
    await user.type(input, 'c');
    await user.click(screen.getByRole('button', { name: 'Join Clubhouse' }));
    expect(joinCircleByCode).toHaveBeenCalledWith('FK-ABC');
  });

  it('explains an unknown invite code in plain words', async () => {
    const { user } = setup({ joinCircleByCode: vi.fn().mockRejectedValue(new Error('INVALID_CODE')) });
    await user.type(screen.getByPlaceholderText('FK-XXXXX'), 'FK-ZZZZ');
    await user.click(screen.getByRole('button', { name: 'Join Clubhouse' }));
    expect(await screen.findByText(/code not found/i)).toBeInTheDocument();
  });
});
