'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { assetUrl } from '@/lib/asset-url';

export function StageFourPreview({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="bunker-preview"
      aria-labelledby="bunker-preview-title"
      aria-describedby="bunker-preview-description"
      onCancel={onClose}
      onClose={onClose}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <header className="bunker-preview-header">
        <span>Stage 5 · Concept artwork</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close Stage 5 preview"
          autoFocus
        >
          <X size={22} aria-hidden="true" />
        </button>
      </header>
      {open && (
        <figure>
          {/* GitHub Pages serves this precompressed asset without an image optimizer. */}
          {/* oxlint-disable-next-line next/no-img-element */}
          <img
            src={assetUrl('/images/stage-4-bunker-concept.jpg')}
            width={1672}
            height={941}
            alt="First-person concept: a coastal artillery gun overlooks the sea while a lamp-lit tunnel descends beneath the bunker."
          />
          <figcaption>Concept artwork · Not gameplay footage</figcaption>
        </figure>
      )}
      <div className="bunker-preview-copy">
        <h2 id="bunker-preview-title">Beneath the guns</h2>
        <p id="bunker-preview-description">
          Enter the coastal gun emplacement. Find the tunnels beneath it. A
          first-person mission inspired by classic corridor shooters, with
          close-quarters combat, hidden passages and underground exploration.
        </p>
        <p className="bunker-preview-note">
          The visual direction for Stage 5. The playable mission now includes
          twelve underground spaces, radio demolition and an escape to the
          landing beach.
        </p>
        <button type="button" className="bunker-preview-back" onClick={onClose}>
          Close concept art
        </button>
      </div>
    </dialog>
  );
}
