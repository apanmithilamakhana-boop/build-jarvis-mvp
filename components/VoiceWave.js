'use client'

import { useEffect, useRef } from 'react'

const BAR_COUNT = 56

// How "energetic" the synthetic wave is per state (SPEAKING uses real audio).
const STATE_ENERGY = {
  IDLE: 0.05,
  LISTENING: 0.45,
  THINKING: 0.18,
  SEARCHING: 0.22,
  SPEAKING: 0.3,
}

export default function VoiceWave({ status, analyserRef }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const color = getComputedStyle(canvas).color
    const data = new Uint8Array(256)
    let frame

    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      canvas.width = canvas.clientWidth * ratio
      canvas.height = canvas.clientHeight * ratio
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      const { width, height } = canvas
      const time = performance.now() / 1000
      const analyser = analyserRef.current
      const useAudio = status === 'SPEAKING' && analyser
      if (useAudio) analyser.getByteFrequencyData(data)

      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = color

      const gap = width / BAR_COUNT
      const barWidth = Math.max(1, gap * 0.45)
      const energy = STATE_ENERGY[status] ?? 0.05

      for (let i = 0; i < BAR_COUNT; i++) {
        const fromCenter = Math.abs(i - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2)
        const envelope = 1 - fromCenter * 0.85
        let amplitude
        if (useAudio) {
          const bin = Math.floor(fromCenter * 90) + 2
          amplitude = (data[bin] / 255) * envelope
        } else {
          const wave =
            Math.sin(i * 0.45 + time * (status === 'THINKING' ? 6 : 3)) * 0.5 +
            Math.sin(i * 0.17 - time * 2.1) * 0.5
          amplitude = energy * envelope * (0.55 + 0.45 * wave)
        }
        const barHeight = Math.max(height * 0.04, amplitude * height * 0.95)
        ctx.globalAlpha = 0.35 + envelope * 0.65
        ctx.fillRect(i * gap + (gap - barWidth) / 2, (height - barHeight) / 2, barWidth, barHeight)
      }
      frame = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [status, analyserRef])

  return <canvas ref={canvasRef} className="h-12 w-full max-w-sm text-primary" aria-hidden="true" />
}
