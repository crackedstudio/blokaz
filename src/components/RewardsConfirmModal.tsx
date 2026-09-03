import React from 'react'

interface Props {
  label: string
  amount: string
  token: string
  onConfirm: () => void
  onNotYet: () => void
  isConfirming: boolean
}

const RewardsConfirmModal: React.FC<Props> = ({
  label,
  amount,
  token,
  onConfirm,
  onNotYet,
  isConfirming,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 28,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 480, padding: '0 16px' }}>
        <div
          style={{
            border: '4px solid #f5c518',
            background: '#181a00',
            padding: 24,
            boxShadow: '6px 6px 0 #f5c518',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏆</div>
            <div style={{
              fontFamily: 'var(--font-display, "Archivo Black", sans-serif)',
              fontSize: 16,
              fontWeight: 900,
              color: '#f5c518',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              Did you receive your reward?
            </div>
            <div style={{
              marginTop: 6,
              fontFamily: 'var(--font-display, "Archivo Black", sans-serif)',
              fontSize: 11,
              color: 'rgba(255,255,255,0.45)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              {label}
            </div>
            <div style={{
              marginTop: 4,
              fontFamily: 'var(--font-display, "Archivo Black", sans-serif)',
              fontSize: 36,
              color: '#fff',
              letterSpacing: '-0.03em',
              lineHeight: 1,
            }}>
              {amount} <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.45)' }}>{token.toLowerCase()}</span>
            </div>
          </div>

          {/* Safety note */}
          <div style={{
            marginBottom: 16,
            padding: '10px 12px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontFamily: 'var(--font-display, "Archivo Black", sans-serif)',
            fontSize: 10,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            textAlign: 'center',
          }}>
            Already marked as claimed — the link stays available in Settings → Rewards
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={onConfirm}
              disabled={isConfirming}
              style={{
                width: '100%',
                background: isConfirming ? 'rgba(74,222,128,0.5)' : '#4ade80',
                color: '#111',
                border: 'none',
                padding: '16px 18px',
                fontFamily: 'var(--font-display, "Archivo Black", sans-serif)',
                fontSize: 14,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                cursor: isConfirming ? 'not-allowed' : 'pointer',
              }}
            >
              {isConfirming ? 'CONFIRMING...' : '✓ YES, I GOT IT'}
            </button>

            <button
              onClick={onNotYet}
              disabled={isConfirming}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.6)',
                border: '2px solid rgba(255,255,255,0.15)',
                padding: '14px 18px',
                fontFamily: 'var(--font-display, "Archivo Black", sans-serif)',
                fontSize: 12,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                cursor: isConfirming ? 'not-allowed' : 'pointer',
              }}
            >
              NO — OPEN THE LINK AGAIN
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RewardsConfirmModal
