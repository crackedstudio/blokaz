/**
 * Lobby meta-progression panel — level, XP bar, and today's three missions.
 *
 * Purely a view over metaStore (localStorage). No chain reads, no wallet calls.
 */

import React from 'react'
import { useMetaStore } from '../stores/metaStore'
import { isMissionComplete, MAX_LEVEL } from '../engine/meta'
import type { ActiveMission } from '../engine/meta'

function MissionRow({ mission }: { mission: ActiveMission }) {
  const complete = isMissionComplete(mission)
  const pct = Math.min(100, Math.round((mission.progress / mission.target) * 100))

  return (
    <div className="border-[2px] border-ink px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span
          className="font-display text-[9px] leading-tight tracking-[0.08em]"
          style={{ opacity: complete ? 0.55 : 1, textDecoration: complete ? 'line-through' : 'none' }}
        >
          {mission.label}
        </span>
        <span
          className="shrink-0 font-display text-[9px] tracking-[0.1em]"
          style={{ color: complete ? 'var(--accent-lime)' : 'var(--muted)' }}
        >
          {complete ? 'DONE' : `+${mission.xp} XP`}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="h-[8px] flex-1 border-[2px] border-ink">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              background: complete ? 'var(--accent-lime)' : 'var(--accent-yellow)',
            }}
          />
        </div>
        <span className="shrink-0 font-display text-[8px] tracking-[0.08em] opacity-60">
          {Math.min(mission.progress, mission.target).toLocaleString()}/
          {mission.target.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

const MetaPanel: React.FC = () => {
  const { level, intoLevel, needed, title, progress, address } = useMetaStore()

  // Nothing to show until a wallet is connected — progress is address-keyed.
  if (!address) return null

  const atMax = level >= MAX_LEVEL
  const pct = atMax ? 100 : Math.min(100, Math.round((intoLevel / needed) * 100))

  return (
    <section className="border-[3px] border-ink">
      {/* Level header */}
      <div className="flex items-center justify-between border-b-[3px] border-ink px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border-[2px] border-ink font-display text-[13px]"
            style={{ background: 'var(--accent-yellow)', color: 'var(--ink)' }}
          >
            {level}
          </div>
          <div className="leading-tight">
            <div className="font-display text-[10px] tracking-[0.18em]">LEVEL {level}</div>
            <div className="font-display text-[8px] tracking-[0.14em] opacity-60">{title}</div>
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className="font-display text-[10px] tracking-[0.12em]">
            {progress.lifetime.bestScore.toLocaleString()}
          </div>
          <div className="font-display text-[8px] tracking-[0.14em] opacity-60">BEST</div>
        </div>
      </div>

      {/* XP bar */}
      <div className="border-b-[3px] border-ink px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-[12px] flex-1 border-[2px] border-ink">
            <div
              className="h-full transition-all duration-500"
              style={{ width: `${pct}%`, background: 'var(--accent-cyan)' }}
            />
          </div>
          <span className="shrink-0 font-display text-[8px] tracking-[0.1em] opacity-60">
            {atMax ? 'MAX' : `${intoLevel.toLocaleString()}/${needed.toLocaleString()}`}
          </span>
        </div>
      </div>

      {/* Daily missions */}
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-[10px] tracking-[0.18em]">TODAY'S MISSIONS</span>
          <span className="font-display text-[8px] tracking-[0.14em] opacity-60">
            {progress.missions.filter(isMissionComplete).length}/{progress.missions.length}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {progress.missions.map((mission, i) => (
            <MissionRow key={`${mission.kind}-${mission.target}-${i}`} mission={mission} />
          ))}
        </div>
      </div>
    </section>
  )
}

export default MetaPanel
