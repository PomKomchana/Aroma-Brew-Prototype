import { useState } from 'react'
import { MODIFIER_GROUP_LABEL, SINGLE_GROUPS, SIZE_LABEL, money } from '../lib/pos'
import type { Modifier, Product } from '../lib/types'

interface Props {
  product: Product
  sizes: string[]
  modifiers: Modifier[]
  onClose: () => void
  onAdd: (size: string, selected: Modifier[]) => void
}

/** [S04 เลือกขนาดและ Modifier (ราคารวมอัปเดตสด)] */
export default function ProductModal({ product, sizes, modifiers, onClose, onAdd }: Props) {
  const [size, setSize] = useState(sizes[0])
  const [selected, setSelected] = useState<Modifier[]>([])

  const groups = [...new Set(modifiers.map((m) => m.type))]
  const unit = Number(product.price) + selected.reduce((s, m) => s + Number(m.extra_price), 0)

  function toggle(m: Modifier) {
    setSelected((prev) => {
      if (prev.some((x) => x.modifier_id === m.modifier_id)) return prev.filter((x) => x.modifier_id !== m.modifier_id)
      const base = SINGLE_GROUPS.includes(m.type) ? prev.filter((x) => x.type !== m.type) : prev
      return [...base, m]
    })
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={product.name}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-img">{product.image && <img src={product.image} alt="" />}</div>
          <div>
            <p className="modal-title">{product.name}</p>
            <p className="muted" style={{ fontSize: 14, margin: 0 }}>
              {money(Number(product.price))}
            </p>
          </div>
        </div>

        {sizes.length > 1 && (
          <div className="group">
            <p className="sec-label">Size</p>
            <div className="opts">
              {sizes.map((s) => (
                <button key={s} className={size === s ? 'opt size on' : 'opt size'} onClick={() => setSize(s)}>
                  {SIZE_LABEL[s] ?? s}
                </button>
              ))}
            </div>
          </div>
        )}

        {groups.map((g) => (
          <div className="group" key={g}>
            <p className="sec-label">{MODIFIER_GROUP_LABEL[g] ?? g}</p>
            <div className="opts">
              {modifiers
                .filter((m) => m.type === g)
                .map((m) => {
                  const on = selected.some((x) => x.modifier_id === m.modifier_id)
                  return (
                    <button key={m.modifier_id} className={on ? 'opt on' : 'opt'} onClick={() => toggle(m)} aria-pressed={on}>
                      {m.name} {Number(m.extra_price) > 0 && <small>+{money(Number(m.extra_price))}</small>}
                    </button>
                  )
                })}
            </div>
          </div>
        ))}

        <div className="modal-actions">
          <button className="btn btn-dark" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={() => onAdd(size, selected)}>
            Add to Cart {money(unit)}
          </button>
        </div>
      </div>
    </div>
  )
}
