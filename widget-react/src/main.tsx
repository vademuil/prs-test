import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App, type MountOptions } from './App';
import './styles.css';

/**
 * Mounts the widget into the given container. Returns an unmount handle.
 * Multiple mounts on the same page are supported (each gets its own React root).
 */
function mount(containerId: string, options: MountOptions = {}): { unmount: () => void } | null {
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('[PRSWidget] Container #' + containerId + ' not found');
    return null;
  }
  const root: Root = createRoot(container);
  root.render(<App options={options} />);
  return {
    unmount: () => {
      root.unmount();
    },
  };
}

// Expose globally for <script src="prs-widget.js"></script> usage.
(window as any).PRSWidget = {
  mount,
  version: '1.0.0',
  buildDate: '2026-05-15',
};

export { mount };
export type { MountOptions };
