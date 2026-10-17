import { Shell } from '../components/Shell'

export default function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <Shell>
      <div className="page">
        <h2>{title}</h2>
        <p className="sub">{note}</p>
      </div>
    </Shell>
  )
}
