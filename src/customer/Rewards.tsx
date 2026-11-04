import { Link } from 'react-router-dom'
import { POINT_RATE } from '../lib/pos'

const FAQ = [
  ['How do I earn points?', `Give your phone number to the cashier when you pay. You earn 1 point for every ฿${POINT_RATE} you spend.`],
  ['How do I check my points?', 'Select Sign in, enter your phone number, then enter the 6-digit code we send. Only registered phone numbers can sign in. If yours is not registered yet, ask the cashier to set you up.'],
  ['What if a bill is cancelled?', 'The points earned from that bill are taken back automatically.'],
  ['Why do I need a code?', 'The code makes sure only you can see your points and purchase history.'],
]

/* Rewards page with points information and FAQs. */
export default function Rewards() {
  return (
    <>
      <section className="cs-hero small">
        <div className="cs-wrap cs-hero-in">
          <p className="cs-kicker">Member rewards</p>
          <h1>Every ฿{POINT_RATE} earns a point</h1>
          <div className="cs-actions"><Link className="cs-btn" to="/signin">Check my points</Link></div>
        </div>
      </section>
      <div className="cs-wrap cs-page">
        <h2 className="cs-h2">How it works</h2>
        <div className="cs-steps">
          {[['1', 'Order at the counter', 'Tell the cashier your phone number when you pay.'],
            ['2', 'Earn points', `${`฿${POINT_RATE}`} = 1 point, added as soon as payment is confirmed.`],
            ['3', 'Check anytime', 'Sign in here with your phone number and a 6-digit code.']].map(([n, t, d]) => (
            <div className="cs-step" key={n}><i>{n}</i><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>

        <h2 className="cs-h2" style={{ marginTop: 56 }}>Questions</h2>
        <div className="cs-faq">
          {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
        </div>
      </div>
    </>
  )
}
