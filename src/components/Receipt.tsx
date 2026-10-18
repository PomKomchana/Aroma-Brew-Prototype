import { PAYMENT_LABEL, SIZE_LABEL, money, type ReceiptData } from '../lib/pos'

/** [S07 ใบเสร็จ] */
export default function Receipt({ data, onNext }: { data: ReceiptData; onNext: () => void }) {
  return (
    <div className="center-page">
      <div className="done">
        <div className="done-tick no-print">✓</div>
        <h2 className="no-print">Payment Successful</h2>
        {data.pending && (
          <p className="pts no-print" style={{ color: 'var(--amber)' }}>
            Saved offline · will sync automatically when the connection is back
          </p>
        )}
        {data.member && data.earnedPoints > 0 && !data.pending && (
          <p className="pts no-print">
            + {data.earnedPoints} Points → {data.member.name}
          </p>
        )}

        <div className="receipt">
          <div className="r">
            <b>Aroma Brew</b>
             <span>{data.pending ? `Bill ${data.orderId}` : `Bill #${data.orderId}`}</span>
          </div>
          <div className="small">{data.time.toLocaleString('th-TH')}</div>
          <hr />
          {data.lines.map((l) => (
            <div key={l.key} style={{ marginBottom: 6 }}>
              <div className="r">
                <span>
                  {l.product.name} ({SIZE_LABEL[l.size]?.split(' ')[0] ?? l.size}) × {l.qty}
                </span>
                <span>{money(l.unitPrice * l.qty)}</span>
              </div>
              {l.modifiers.length > 0 && <div className="small">{l.modifiers.map((m) => m.name).join(', ')}</div>}
            </div>
          ))}
          <hr />
          <div className="r">
            <span>Subtotal</span>
            <span>{money(data.subtotal)}</span>
          </div>
          {data.discount > 0 && (
            <div className="r">
              <span>Discount {data.promoName}</span>
              <span>−{money(data.discount)}</span>
            </div>
          )}
          <div className="r" style={{ fontWeight: 600 }}>
            <span>Total</span>
            <span>{money(data.total)}</span>
          </div>
          <div className="r small">
            <span>Payment Method: {PAYMENT_LABEL[data.method]}</span>
            {data.method === 'cash' && data.received !== null && <span>Received {money(data.received)} · Change {money(data.change)}</span>}
          </div>
          {data.member && (
            <div className="small" style={{ marginTop: 6 }}>
              Member {data.member.masked_phone}
            </div>
          )}
        </div>

        <div className="row no-print">
          <button className="btn btn-dark" style={{ flex: 1 }} onClick={() => window.print()}>
            Print Receipt
          </button>
          <button className="btn" style={{ flex: 1 }} onClick={onNext}>
            Next Order
          </button>
        </div>
      </div>
    </div>
  )
}
