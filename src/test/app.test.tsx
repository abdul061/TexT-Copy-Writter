import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import App from '../App';

afterEach(() => cleanup());

describe('App shell', () => {
  it('renders the product identity in the header', () => {
    render(<App />);
    const matches = screen.getAllByText(/Anchor-Weave/i);
    expect(matches.length).toBeGreaterThan(0);
    // The honesty disclaimer must be present in the footer too.
    expect(screen.getAllByText(/proof of authorship/i).length).toBeGreaterThan(0);
  });

  it('shows the Text Workbench as the default tab', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: '1 · Original text' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Generate marked copy/ }),
    ).toBeInTheDocument();
  });
});

describe('tab navigation (fireEvent = wrapped in act by Testing Library)', () => {
  it('switches to each tab and renders that tab-specific content', () => {
    render(<App />);

    // Workbench (default)
    expect(
      screen.getByRole('heading', { name: '1 · Original text' }),
    ).toBeInTheDocument();

    // Baseline
    fireEvent.click(screen.getByRole('button', { name: /Baseline/ }));
    expect(
      screen.getByRole('heading', { name: 'How the frame is built' }),
    ).toBeInTheDocument();

    // Transformations
    fireEvent.click(screen.getByRole('button', { name: /Transformations/ }));
    expect(
      screen.getByRole('heading', { name: 'Transformation Lab' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Run transformation/ }),
    ).toBeInTheDocument();

    // Decoder
    fireEvent.click(screen.getByRole('button', { name: /^Decoder/ }));
    expect(
      screen.getByRole('button', { name: /Extract evidence/ }),
    ).toBeInTheDocument();

    // Benchmark
    fireEvent.click(screen.getByRole('button', { name: /^Benchmark/ }));
    expect(
      screen.getByRole('heading', { name: 'Benchmark Dashboard' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Run benchmark/ }),
    ).toBeInTheDocument();

    // Experimental — must carry its unvalidated warning
    fireEvent.click(screen.getByRole('button', { name: /Experimental/ }));
    // Matches both the sandbox banner and the footer disclaimer.
    expect(
      screen.getAllByText(/unvalidated prototypes/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getByRole('button', { name: /Encode \(unvalidated\)/ }),
    ).toBeInTheDocument();

    // Security & Docs
    fireEvent.click(screen.getByRole('button', { name: /Security & Docs/ }));
    expect(
      screen.getByRole('heading', { name: 'Threat model (baseline)' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/No persistent storage by default/),
    ).toBeInTheDocument();
  });
});
