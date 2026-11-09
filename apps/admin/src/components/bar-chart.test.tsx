import { fireEvent, render, screen } from '@testing-library/react';
import { BarChart, niceMax } from './bar-chart';

describe('BarChart', () => {
  const data = [
    { label: '11/01', value: 3, detail: 'Sabtu, 1 November 2026' },
    { label: '11/02', value: 12, detail: 'Minggu, 2 November 2026' },
  ];

  it('exposes every bar with an accessible label', () => {
    render(<BarChart data={data} title="Ulasan" valueLabel="ulasan" />);
    expect(screen.getByLabelText('Minggu, 2 November 2026: 12 ulasan')).toBeInTheDocument();
  });

  it('shows a tooltip on focus (keyboard reachable)', () => {
    render(<BarChart data={data} title="Ulasan" valueLabel="ulasan" />);
    fireEvent.focus(screen.getByLabelText('Sabtu, 1 November 2026: 3 ulasan'));
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('offers a table view of the same data', () => {
    render(<BarChart data={data} title="Ulasan" valueLabel="ulasan" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tampilkan tabel' }));
    expect(screen.getByRole('table')).toHaveTextContent('Minggu, 2 November 2026');
  });

  it('rounds axis maximum to a readable value', () => {
    expect(niceMax(3)).toBe(4);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(230)).toBe(250);
  });
});
