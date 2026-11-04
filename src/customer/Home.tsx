import { useEffect, useRef } from 'react'
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
  const pullRef = useRef<HTMLElement>(null)

  // The white panel rises over the hero as you scroll, and its content settles in after it
  useEffect(() => {
    const el = pullRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--p', '1')
      el.classList.add('in')
      return
    }
    let raf = 0
    const update = () => {
      raf = 0
      const p = Math.min(1, Math.max(0, window.scrollY / 320))
      el.style.setProperty('--p', String(p))
      el.classList.toggle('in', p > 0.12 || el.getBoundingClientRect().top < window.innerHeight * 0.55)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  return (
    <>
      <section className="cs-hero big">
        <div className="cs-wrap cs-hero-in">
          <h1>Sip. <span className="cs-gold">Earn.</span><br />Come back for more.</h1>
          <p className="cs-lead">Every {`฿${POINT_RATE}`} you spend earns 1 point. Share your phone number at the counter and check your points here anytime.</p>
          <div className="cs-actions">
            <Link className="cs-btn" to="/menu">Order ahead</Link>
            <Link className="cs-btn ghost" to="/signin">Check my points</Link>
          </div>
        </div>
      </section>

      <section className="cs-pull" ref={pullRef}>
        <div className="cs-pull-card">
          <h2 className="cs-pull-h">Skip the queue</h2>
          <div className="cs-steps">
            {[['1', 'Choose your order', 'Pick drinks and bakes from the menu and add them to your basket.'],
              ['2', 'Pick a time', 'Choose a pickup time today and sign in with your phone number.'],
              ['3', 'Collect and pay', 'Give your order number at the counter and pay when you collect.']].map(([n, t, d]) => (
              <div className="cs-step" key={n}><i>{n}</i><h3>{t}</h3><p>{d}</p></div>
            ))}
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
          <Link className="cs-btn" to="/signin">Check my points</Link>
        </div>
      </section>
    </>
  )
}
