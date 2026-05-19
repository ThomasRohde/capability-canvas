import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile } from './fileSystem';

describe('saveFile', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('falls back to a browser download when the native save picker is blocked', async () => {
    vi.useFakeTimers();
    const showSaveFilePicker = vi
      .fn()
      .mockRejectedValue(
        new DOMException(
          'Failed to execute showSaveFilePicker on Window: The request is not allowed by the user agent or the platform in the current context.',
          'NotAllowedError',
        ),
      );
    const createObjectURL = vi.fn(() => 'blob:capability-canvas-export');
    const revokeObjectURL = vi.fn();
    let clickedAnchor: HTMLAnchorElement | null = null;
    vi.stubGlobal('showSaveFilePicker', showSaveFilePicker);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      clickedAnchor = document.querySelector('a[download]');
    });

    const result = await saveFile({
      filename: 'retail-bank.capability-canvas.json',
      mimeType: 'application/json',
      data: '{"title":"Retail Bank"}',
    });

    expect(result).toEqual({ status: 'saved' });
    expect(showSaveFilePicker).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const anchor = requireClickedAnchor(clickedAnchor);
    expect(anchor.download).toBe('retail-bank.capability-canvas.json');
    expect(anchor.href).toBe('blob:capability-canvas-export');
    expect(anchor.isConnected).toBe(false);

    vi.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith(
      'blob:capability-canvas-export',
    );
  });
});

function requireClickedAnchor(
  anchor: HTMLAnchorElement | null,
): HTMLAnchorElement {
  if (!anchor) throw new Error('Expected saveFile to click a download anchor.');
  return anchor;
}
