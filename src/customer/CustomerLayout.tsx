import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import './customer.css'
import { useBasket } from './basketContext'
import { useMember } from './member'

const LINKS = [
  { to: '/menu', label: 'Menu' },
  { to: '/rewards', label: 'Rewards' },
  { to: '/allergens', label: 'Allergen guide' },
  { to: '/stores', label: 'Find us' },
]
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600&family=Outfit:wght@300;400;500;600&display=swap'

// Customer layout with sticky header, navigation, and three-column footer
export default function CustomerLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { count } = useBasket()
  const { token } = useMember()
  const minimal = pathname === '/signin'

  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [pathname])

  // Load Fraunces and Outfit fonts on customer pages only
  useEffect(() => {
    if (document.getElementById('cs-fonts')) return
    const l = document.createElement('link')
    l.id = 'cs-fonts'; l.rel = 'stylesheet'; l.href = FONTS
    document.head.appendChild(l)
  }, [])

  return (
    // Customer layout with sticky header, navigation, and three-column footer
    <div className="cs">
      <a className="cs-skip" href="#main-content">Skip to content</a>
      <header className={minimal ? 'cs-head min' : 'cs-head'}>
        <div className="cs-bar">
          <Link to="/" className="cs-logo">AROMA BREW</Link>
          {!minimal && <>
          <nav className={open ? 'cs-nav open' : 'cs-nav'} aria-label="Main">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
            {token && <NavLink to="/my-orders">My orders</NavLink>}
            <Link className="cs-cta cs-cta-m" to="/signin">{token ? 'Account' : 'Sign in'}</Link>
          </nav>
          <Link className="cs-basket" to="/basket" aria-label={`Basket, ${count} items`}>Basket{count > 0 && <b>{count}</b>}</Link>
          <Link className="cs-cta cs-cta-d" to="/signin">{token ? 'Account' : 'Sign in'}</Link>
          <button className="cs-burger" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button>
          </>}
        </div>
      </header>

      <main id="main-content"><Outlet /></main>

      {!minimal && <footer className="cs-foot">
        <div className="cs-wrap cs-foot-grid">
          <div>
            <p className="cs-logo">AROMA BREW</p>
            <p className="cs-foot-note">Coffee, tea and fresh bakery, made to order.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <Link to="/menu">Menu</Link>
            <Link to="/allergens">Allergen guide</Link>
            <Link to="/stores">Find us</Link>
          </div>
          <div>
            <h4>Rewards</h4>
            <Link to="/rewards">How points work</Link>
            <Link to="/signin">Check my points</Link>
          </div>
          <div>
            <h4>Team</h4>
            <Link to="/login">Staff log in</Link>
          </div>
        </div>
        <div className="cs-wrap cs-copy">© Aroma Brew · CPE230 course project</div>
      </footer>}
    </div>
  )
}
