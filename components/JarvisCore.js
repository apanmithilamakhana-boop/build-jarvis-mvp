'use client'

import { useEffect, useRef } from 'react'

/**
 * CSS-animated AI core. The `data-state` attribute drives the animations
 * (see .jarvis-core in globals.css). While speaking, the orb scales with the
 * live audio level, written straight to a CSS variable to avoid re-renders.
 */
export default function JarvisCore({ status, analyserRef }) {
  const coreRef = useRef(null)

  useEffect(() => {
    const core = coreRef.current
    if (!core) return
    if (status !== 'SPEAKING') {
      core.style.setProperty('--level', '0')
      return
    }

    const data = new Uint8Array(256)
    let frame
    const tick = () => {
      const analyser = analyserRef.current
      let level
      if (analyser) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 2; i < 64; i++) sum += data[i]
        level = Math.min(1, sum / 62 / 170)
      } else {
        level = 0.35 + 0.25 * Math.sin(performance.now() / 110)
      }
      core.style.setProperty('--level', level.toFixed(3))
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [status, analyserRef])

  return (
    <div
      ref={coreRef}
      data-state={status}
      className="jarvis-core w-[min(70vw,320px)] lg:w-[min(38vh,360px)]"
      aria-hidden="true"
    >
      <div className="core-layer core-ticks" />
      <div className="core-layer core-ring" />
      <div className="core-layer core-arc-a" />
      <div className="core-layer core-arc-b" />
      <div className="core-layer core-arc-c" />
      <div className="core-layer core-scan" />
      <div className="core-layer core-orb">
        <span className="font-mono text-[10px] font-medium tracking-[0.35em] text-primary-foreground/80">
          AI CORE
        </span>
      </div>
    </div>
  )
}
