import React from 'react'

type IconName = 
  | 'flame' 
  | 'alert' 
  | 'rocket' 
  | 'history' 
  | 'trophy' 
  | 'zap' 
  | 'timer' 
  | 'skull' 
  | 'star' 
  | 'crown' 
  | 'trending'
  | 'share'
  | 'pause'
  | 'play'
  | 'back'
  | 'sun'
  | 'moon'

interface BrutalIconProps {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}

export const BrutalIcon: React.FC<BrutalIconProps> = ({ 
  name, 
  size = 24, 
  className = '', 
  strokeWidth = 3 
}) => {
  const icons: Record<IconName, React.ReactNode> = {
    flame: (
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.236 1.1-3.173 1.07 1.136 2.303 2.173 3.4 3.173z" />
    ),
    alert: (
      <>
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    rocket: (
      <>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.71-2.13.09-3.09s-1.89-1.25-3.09-.91Z" />
        <path d="m12 15 3.5 3.5" />
        <path d="m9 12 3.5 3.5" />
        <path d="M11.5 9.5 15 13" />
        <path d="M22 2s-5.69 4.01-6.13 5.04c-.44 1.03-1.26 2.13-2.13 3.47L11.5 9.5l3.47-2.13L16 6.13C17.03 5.69 22 2 22 2Z" />
      </>
    ),
    history: (
      <>
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M12 7v5l4 2" />
      </>
    ),
    trophy: (
      <>
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
        <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </>
    ),
    zap: (
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
    ),
    timer: (
      <>
        <path d="M10 2h4" />
        <path d="M12 14v-4" />
        <path d="M4 13a8 8 0 1 0 16 0 8 8 0 1 0-16 0z" />
        <path d="M12 7v1" />
      </>
    ),
    skull: (
      <>
        <path d="M9 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
        <path d="M17 10a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
        <path d="M12 2a8 8 0 0 0-8 8c0 1.5 1.5 3.5 2 5a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1c.5-1.5 2-3.5 2-5a8 8 0 0 0-8-8Z" />
        <path d="M12 14v1" />
        <path d="M10 14v1" />
        <path d="M14 14v1" />
        <path d="M9 20h6" />
        <path d="M10 17v3" />
        <path d="M14 17v3" />
      </>
    ),
    star: (
      <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z" />
    ),
    crown: (
      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7Z" />
    ),
    trending: (
      <>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </>
    ),
    share: (
      <>
        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
        <polyline points="16 6 12 2 8 6" />
        <line x1="12" y1="2" x2="12" y2="15" />
      </>
    ),
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" />
        <rect x="14" y="4" width="4" height="16" />
      </>
    ),
    play: (
      <path d="m5 3 14 9-14 9V3Z" />
    ),
    back: (
      <>
        <path d="m12 19-7-7 7-7" />
        <path d="M19 12H5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
    moon: (
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={className}
    >
      {icons[name]}
    </svg>
  )
}
