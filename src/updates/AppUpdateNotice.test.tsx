import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AppUpdateNotice } from './AppUpdateNotice';
import { appUpdates, type UpdateState } from './appUpdates';
const available: UpdateState = {
  supported: true,
  available: true,
  checking: false,
  applying: false,
  error: '',
};
afterEach(() => vi.restoreAllMocks());
it('requires acceptance, explains unsaved scores and allows keeping the current session', () => {
  vi.spyOn(appUpdates, 'snapshot').mockReturnValue(available);
  const apply = vi.spyOn(appUpdates, 'apply').mockImplementation(() => {});
  render(<AppUpdateNotice />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar app' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Placar provisório e textos não salvos serão descartados'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continuar no app' }));
  expect(apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar app' }));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar agora' }));
  expect(apply).toHaveBeenCalledOnce();
});
it('does not allow reload during a local write or a cloud critical section', () => {
  vi.spyOn(appUpdates, 'snapshot').mockReturnValue(available);
  render(<AppUpdateNotice disabled />);
  expect(screen.getByRole('button', { name: 'Atualizar app' })).toBeDisabled();
});
