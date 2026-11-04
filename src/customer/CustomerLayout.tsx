import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import './customer.css'
import { useBasket } from './basketContext'
import { useMember } from './member'
import { rpc } from '../lib/api'

const LINKS = [
  { to: '/menu', label: 'Menu' },
  { to: '/rewards', label: 'Rewards' },
  { to: '/allergens', label: 'Allergen guide' },
  { to: '/stores', label: 'Find us' },
]
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600;9..144,800&family=Outfit:wght@300;400;500;600&display=swap'

// Customer layout with sticky header, navigation, and three-column footer
export default function CustomerLayout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { count } = useBasket()
  const { token, clear } = useMember()
  const nav = useNavigate()
  const [phone, setPhone] = useState('')

  // Phone number of the signed-in member, shown in the Account hover menu
  useEffect(() => {
    if (!token) { setPhone(''); return }
    let on = true
    rpc<{ masked_phone: string }>('get_member_summary', { p_token: token })
      .then((r) => { if (on) setPhone(r.masked_phone) })
      .catch(() => { if (on) setPhone('') })
    return () => { on = false }
  }, [token])

  async function signOut() {
    if (token) await rpc('member_logout', { p_token: token }).catch(() => {})
    clear()
    nav('/')
  }
  const minimal = pathname === '/signin'
  const home = pathname === '/'
  const [scrolled, setScrolled] = useState(false)

  // Home header floats over the hero, then turns solid after a little scrolling
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
      <header className={['cs-head', minimal && 'min', home && 'home', home && !scrolled && !open && 'over'].filter(Boolean).join(' ')}>
        <div className="cs-bar">
          <Link to="/" className="cs-logo">Aroma <span>Brew</span></Link>
          {!minimal && <>
          <nav className={open ? 'cs-nav open' : 'cs-nav'} aria-label="Main">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to}>{l.label}</NavLink>)}
            {token && <NavLink to="/my-orders">My orders</NavLink>}
            {token && phone && <p className="cs-nav-phone">Signed in as {phone}</p>}
            <Link className="cs-cta cs-cta-m" to="/signin">{token ? 'Account' : 'Sign in'}</Link>
          </nav>
          <Link className="cs-order-link" to="/menu">Order now</Link>
          <Link className="cs-bag" to="/basket" aria-label={`Basket, ${count} items`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
            {count > 0 && <b>{count}</b>}
          </Link>
          <div className="cs-acct">
            <Link className="cs-cta cs-cta-d" to="/signin">{token ? 'Account' : 'Sign in'}</Link>
            {token && (
              <div className="cs-acct-pop">
                <div className="cs-acct-card" role="status">
                  <p className="cs-acct-label">Signed in with</p>
                  <p className="cs-acct-phone">{phone || '…'}</p>
                  <div className="cs-acct-links">
                    <Link to="/signin">My points</Link>
                    <button type="button" onClick={signOut}>Sign out</button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button className="cs-burger" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '✕' : '☰'}</button>
          </>}
        </div>
      </header>

      <main id="main-content"><Outlet /></main>

      {!minimal && <footer className="cs-foot">
        <div className="cs-wrap cs-foot-grid">
          <div>
            <p className="cs-logo">Aroma <span>Brew</span></p>
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
