import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useEffect, useState } from 'react'
import { num } from '../api'

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || '#000'

function useThemeVersion() {
  const [v, setV] = useState(0)
  useEffect(() => {
    const bump = () => setV((n) => n + 1)
    const obs = new MutationObserver(bump)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    window.addEventListener('themechange', bump)
    return () => { obs.disconnect(); window.removeEventListener('themechange', bump) }
  }, [])
  return v
}

export default function FootfallChart({ data }) {
  const themeVersion = useThemeVersion()
  if (!data) return <div className="skeleton" style={{ height: 260 }} />
  const windows = data.peak_windows || []
  const text = css('--text')
  return (
    <div className="chart-box" key={themeVersion}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data.hourly} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={css('--border-soft')} vertical={false} />
          {windows.map((w) => (
            <ReferenceArea key={w.start} x1={labelFor(w.start)} x2={labelFor(w.end - 1)} fill={css('--peak')} fillOpacity={1} ifOverflow="extendDomain"
              label={{ value: 'PEAK', position: 'insideTop', fill: text, fontSize: 10, fontWeight: 700 }} />
          ))}
          <XAxis dataKey="label" stroke={text} tick={{ fill: text, fontSize: 12 }} tickLine={false} />
          <YAxis stroke={text} tick={{ fill: text, fontSize: 12 }} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v)} width={40} />
          <Tooltip formatter={(v, n) => [num(v), n]} labelFormatter={(l) => `Hour ${l}`} contentStyle={{ border: `1.5px solid ${text}`, borderRadius: 6 }} />
          <Legend wrapperStyle={{ fontSize: 12, color: text }} />
          <Area type="monotone" dataKey="weekday" name="Weekday avg" stroke={css('--chart-1')} fill={css('--chart-1')} fillOpacity={0.08} strokeWidth={2.5} />
          <Line type="monotone" dataKey="weekend" name="Weekend avg" stroke={css('--chart-2')} strokeWidth={2} strokeDasharray="5 4" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function labelFor(h) {
  return `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`
}
