import { Link } from 'react-router-dom'
import { money, ALLERGEN_LABEL } from '../lib/pos'
import type { Product } from '../lib/types'
import { bigImg } from './useMenu'

/* Product cards with images, names, prices, and detail links. */
export default function ProductCard({ p, onShow, onHide }: {
  p: Product
  onShow?: (e: React.PointerEvent<HTMLElement> | React.FocusEvent<HTMLElement>, p: Product) => void
  onHide?: () => void
}) {
  const img = bigImg(p.image)
  const al = p.allergens ?? []
  return (
    <Link
      to={`/menu/${p.product_id}`}
      className="cs-pcard"
      onPointerEnter={onShow && ((e) => onShow(e, p))}
      onPointerMove={onShow && ((e) => onShow(e, p))}
      onPointerLeave={onHide}
      onFocus={onShow && ((e) => onShow(e, p))}
      onBlur={onHide}
      onClick={onHide}
    >
      <div className="cs-pimg" style={img ? { backgroundImage: `url(${img})` } : undefined} role="img" aria-label={p.name} />
      <div className="cs-pbody">
        <h3 className="cs-pname">{p.name}</h3>
        <p className="cs-pprice">{money(Number(p.price))}</p>
        {al.length > 0 && <p className="cs-ptags">Contains: {al.map((a) => ALLERGEN_LABEL[a] ?? a).join(', ')}</p>}
      </div>
    </Link>
  )
}
