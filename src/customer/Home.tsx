import { Link } from 'react-router-dom'
import { POINT_RATE } from '../lib/pos'
import { activePromos, bigImg, catLabel, promoText, promoUntil, useMenu } from './useMenu'

function Media({ src }: { src: string | null }) {
  return <div className="cs-card-media" style={src ? { backgroundImage: `url(${src})` } : undefined} />
}

export default function Home() {
  const { data } = useMenu()
  const products = data?.products ?? []
  const withImg = products.filter((p) => p.image)
  const promo = data ? activePromos(data.promos)[0] : undefined
  const cats = Array.from(new Set(products.map((p) => p.category)))
  const catImg = (c: string) => bigImg(products.find((p) => p.category === c && p.image)?.image)

  return (
    <>
      <section className="cs-hero">
        <div className="cs-wrap cs-hero-in">
          <p className="cs-kicker">Member rewards</p>
          <h1>Sip. Earn.<br />Come back for more.</h1>
          <p className="cs-lead">Every {`฿${POINT_RATE}`} you spend earns 1 point. Share your phone number at the counter and check your points here anytime.</p>
          <div className="cs-actions">
            <Link className="cs-btn" to="/member">Check my points</Link>
            <Link className="cs-btn ghost" to="/menu">View menu</Link>
          </div>
        </div>
      </section>

      <section className="cs-sec">
        <div className="cs-wrap cs-cards">
          <Link to="/rewards" className="cs-card">
            <Media src={bigImg(withImg[0]?.image)} />
            <div className="cs-card-body">
              <p className="cs-kicker">Rewards</p>
              <h3>Earn points on every order</h3>
              <p>{`฿${POINT_RATE}`} = 1 point. Sign in with your phone number to see your balance and recent purchases.</p>
              <span className="cs-more">Learn more →</span>
            </div>
          </Link>
          <Link to="/menu" className="cs-card">
            <Media src={bigImg(withImg[1]?.image)} />
            <div className="cs-card-body">
              <p className="cs-kicker">{promo ? 'Current offer' : 'Our menu'}</p>
              <h3>{promo ? `${promo.name} · ${promoText(promo)}` : 'Fresh coffee, tea and bakery'}</h3>
              <p>{promo ? `Applied automatically at the counter, no code needed. ${promoUntil(promo)}.` : 'Browse everything we make, with ingredients and allergens on every item.'}</p>
              <span className="cs-more">View menu →</span>
            </div>
          </Link>
          <Link to="/allergens" className="cs-card">
            <Media src={bigImg(withImg[2]?.image)} />
            <div className="cs-card-body">
              <p className="cs-kicker">Good to know</p>
              <h3>Know what is in your cup</h3>
              <p>See which of our drinks and bakes contain gluten, milk, egg, nuts and more.</p>
              <span className="cs-more">Allergen guide →</span>
            </div>
          </Link>
        </div>
      </section>

      <section className="cs-sec cs-sec-sand">
        <div className="cs-wrap">
          <p className="cs-kicker">Browse</p>
          <h2 className="cs-h2">Our food and drink menu</h2>
          <div className="cs-tiles">
            {cats.map((c) => (
              <Link key={c} to={`/menu?cat=${c}`} className="cs-tile" style={catImg(c) ? { backgroundImage: `url(${catImg(c)})` } : undefined}>
                <span>{catLabel(c)}</span>
              </Link>
            ))}
            <Link to="/menu" className="cs-tile plain"><span>See everything</span></Link>
          </div>
        </div>
      </section>

      <section className="cs-band">
        <div className="cs-wrap cs-band-in">
          <div>
            <h2 className="cs-h2">Already a member?</h2>
            <p>Enter your phone number, confirm with a 6-digit code, and see your points and purchase history.</p>
          </div>
          <Link className="cs-btn" to="/member">Check my points</Link>
        </div>
      </section>
    </>
  )
}
