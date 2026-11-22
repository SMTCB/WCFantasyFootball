// Every destructive commissioner action (void a bet, run allocation, archive, remove a
// manager) goes through useConfirmDialog → ConfirmModal. These tests pin the contract:
// nothing runs until the user confirms, and cancel, Escape and the backdrop never run it.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useConfirmDialog from '../../src/hooks/useConfirmDialog';
import ConfirmModal from '../../src/components/ConfirmModal';

function Harness({ onConfirm }) {
  const [ask, dialog] = useConfirmDialog();
  return (
    <>
      <button type="button" onClick={() => ask({ title: 'Remove manager?', body: 'They lose their squad.', confirmLabel: 'Remove', onConfirm })}>
        Remove Alex
      </button>
      {dialog}
    </>
  );
}

describe('useConfirmDialog', () => {
  it('shows nothing until asked', () => {
    render(<Harness onConfirm={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('runs the action only after Remove is pressed, then closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Remove Alex' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('They lose their squad.');
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Cancel closes without running the action', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Remove Alex' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Escape closes without running the action', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<Harness onConfirm={onConfirm} />);
    await user.click(screen.getByRole('button', { name: 'Remove Alex' }));
    await user.keyboard('{Escape}');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('ConfirmModal', () => {
  it('puts focus on Cancel, so Enter never confirms by accident', () => {
    render(<ConfirmModal title="Sell?" body="b" confirmLabel="Sell" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('a click on the backdrop cancels', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmModal title="Sell?" body="b" onConfirm={onConfirm} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('presentation'));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores Cancel and Escape while the action is still running', async () => {
    let finish;
    const onConfirm = vi.fn(() => new Promise(resolve => { finish = resolve; }));
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmModal title="Sell?" body="b" confirmLabel="Sell" onConfirm={onConfirm} onCancel={onCancel} />);
    await user.click(screen.getByRole('button', { name: 'Sell' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    fireEvent.click(screen.getByRole('presentation'));
    expect(onCancel).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onCancel).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
