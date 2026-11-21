import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the Phase 1 foundation shell', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Anar' })).toBeInTheDocument();
    expect(screen.getByText('v0.0.1')).toBeInTheDocument();
  });
});
