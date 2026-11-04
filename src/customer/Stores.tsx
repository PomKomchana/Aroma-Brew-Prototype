import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { rpc, errMsg } from '../lib/api'
import { Icon } from '../components/Icon'

interface Branch { name: string; address: string | null; phone: string | null }

/** Embedded Google map for one branch (no API key needed for the basic embed). */
const mapSrc = (b: Branch | undefined) =>
  `https://maps.google.com/maps?q=${encodeURIComponent(b ? `${b.name} ${b.address ?? ''}`.trim() : 'Bangkok, Thailand')}&z=${b ? 15 : 11}&output=embed`
const directionsHref = (b: Branch) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${b.name} ${b.address ?? ''}`.trim())}`

/**
 * "Find us" page, laid out like Pret's store locator:
 * search box + branch list on the left, map of the selected branch on the right.
 * Branches come from get_branches() in sql/11.
 */
export default function Stores() {
  const [list, setList] = useState<Branch[] | null>(null)
  const [error, setError] = useState('')
  const [input, setInput] = useState('')   // text in the search box
  const [query, setQuery] = useState('')   // applied when the user presses Search
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    rpc<Branch[]>('get_branches', {}).then((r) => on && setList(r)).catch((e) => on && setError(errMsg(e)))
    return () => { on = false }
  }, [])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (list ?? []).filter((b) => !q || `${b.name} ${b.address ?? ''}`.toLowerCase().includes(q))
  }, [list, query])

  // The map follows the selected branch; fall back to the first match.
  const current = shown.find((b) => b.name === selected) ?? shown[0]

  function search(e: FormEvent) {
    e.preventDefault()
    setQuery(input)
    setSelected(null)
  }

  return (
    <div className="cs-find">
      <aside className="cs-find-side">
        <form className="cs-find-search" onSubmit={search} role="search">
          <input
            type="search"
            placeholder="Search locations"
            aria-label="Search locations"
            value={input}
            onChange={(e) => { setInput(e.target.value); if (!e.target.value) setQuery('') }}
          />
          <button type="submit">Search</button>
        </form>

        <div className="cs-find-count" role="status">
          {list && `${shown.length} ${shown.length === 1 ? 'location' : 'locations'}`}
        </div>

        <div className="cs-find-list">
          {error && <p className="cs-muted cs-find-msg">Branch details are not available right now.</p>}
          {!list && !error && <p className="cs-muted cs-find-msg">Loading…</p>}
          {list && list.length === 0 && <p className="cs-muted cs-find-msg">No branches listed yet.</p>}
          {list && list.length > 0 && shown.length === 0 && <p className="cs-muted cs-find-msg">No locations match your search.</p>}
          {shown.map((b) => (
            <article
              key={b.name}
              className={b === current ? 'cs-find-item on' : 'cs-find-item'}
              onClick={() => setSelected(b.name)}
            >
              <button type="button" className="cs-find-pick" aria-pressed={b === current} onClick={() => setSelected(b.name)}>
                <h2>{b.name}</h2>
                {b.address && <p>{b.address}</p>}
              </button>
              <div className="cs-find-actions">
                {b.phone && <a href={`tel:${b.phone}`}><Icon name="phone" size={16} />{b.phone}</a>}
                <a href={directionsHref(b)} target="_blank" rel="noreferrer"><Icon name="pin" size={16} />Get directions</a>
              </div>
            </article>
          ))}
        </div>
      </aside>

      <div className="cs-find-map">
        <iframe title={current ? `Map of ${current.name}` : 'Map'} src={mapSrc(current)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </div>
    </div>
  )
}
