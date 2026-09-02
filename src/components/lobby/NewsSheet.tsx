/**
 * NEWS — the body copy that used to sit open on the lobby.
 *
 * The front page carries a headline count only; the writing lives here.
 */

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrutalIcon } from '../BrutalIcon'
import { getLiveNewsItems, TAG_COLORS } from './news'
import { BlockCluster } from '../blocks/BlockFX'

const NewsSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const items = getLiveNewsItems()
  const [idx, setIdx] = useState(0)
  const item = items[idx]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!item) return null
  const tc = TAG_COLORS[item.tag]

  return createPortal(
    <div
      className="fixed inset-0 z-[420] flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      role="dialog"
      aria-modal="true"
      aria-label="News"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-md flex-col border-[2px] border-ink"
        style={{ background: 'var(--paper)', boxShadow: '6px 6px 0 var(--shadow)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b-[2px] border-ink px-4 py-3">
          <span className="flex items-center gap-2.5">
            <BlockCluster cell={7} />
            <span className="font-display text-[11px] uppercase tracking-[0.18em]">News</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-1"
            style={{ color: 'var(--ink)' }}
          >
            <BrutalIcon name="close" size={15} strokeWidth={3} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div className="flex items-center gap-2">
            <span
              className="border-[2px] border-ink px-2 py-[1px] font-display text-[8px] uppercase tracking-[0.16em]"
              style={{ background: tc.bg, color: tc.color }}
            >
              {item.tag}
            </span>
            <span
              className="font-display text-[8px] uppercase tracking-[0.16em]"
              style={{ color: 'var(--ink-soft)' }}
            >
              {item.date}
            </span>
          </div>

          <h2
            className="mt-3 font-display uppercase"
            style={{ fontSize: 17, lineHeight: 1.15, letterSpacing: '-0.015em', margin: 0 }}
          >
            {item.headline}
          </h2>

          <p
            className="font-body"
            style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--ink-soft)', margin: '10px 0 0' }}
          >
            {item.body}
          </p>

          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-between border-[2px] border-ink px-3 py-2 font-display text-[9px] uppercase tracking-[0.14em] no-underline"
              style={{ background: tc.bg, color: tc.color }}
            >
              <span>Read more</span>
              <span>→</span>
            </a>
          )}

          {items.length > 1 && (
            <div className="mt-4 flex gap-2">
              {items.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIdx(i)}
                  aria-label={`News item ${i + 1}`}
                  className="h-[6px] flex-1 border-[2px] border-ink p-0"
                  style={{
                    background: i === idx ? 'var(--accent-yellow)' : 'var(--paper-2)',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default NewsSheet
