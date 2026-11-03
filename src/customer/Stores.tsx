import { useEffect, useState } from 'react'
import { rpc, errMsg } from '../lib/api'

interface Branch { name: string; address: string | null; phone: string | null }

/* Branch locations loaded from get_branches() in sql/11. */
export default function Stores() {
  const [list, setList] = useState<Branch[] | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let on = true
    rpc<Branch[]>('get_branches', {}).then((r) => on && setList(r)).catch((e) => on && setError(errMsg(e)))
    return () => { on = false }
  }, [])

  return (
    <div className="cs-wrap cs-page">
      <p className="cs-kicker">Visit us</p>
      <h1 className="cs-h1">Find us</h1>
      {error && <p className="cs-muted">Branch details are not available right now.</p>}
      {!list && !error && <p className="cs-muted">Loading…</p>}
      {list && list.length === 0 && <p className="cs-muted">No branches listed yet.</p>}
      <div className="cs-cards">
        {(list ?? []).map((b) => (
          <div className="cs-card" key={b.name}>
            <div className="cs-card-body">
              <h3>{b.name}</h3>
              {b.address && <p>{b.address}</p>}
              {b.phone && <p><a href={`tel:${b.phone}`}>{b.phone}</a></p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
