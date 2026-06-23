// Right-hand info card: logo, who/where, and a booking summary — mirrors the
// Setmore layout Dani wants to replicate, in Ramaz branding.
//
// Logo file lives in /public. If it's missing the <img> simply hides itself, so
// the layout never breaks before the asset is dropped in.
export default function Sidebar({ settings, durationMin }) {
  return (
    <aside className="sidebar">
      <div className="side-card">
        <img
          className="side-logo"
          src="/israel-guidance-logo.png"
          alt="Ramaz Israel Guidance"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <h2 className="side-title">Ramaz Israel Guidance</h2>
        {settings?.location && <p className="side-address">{settings.location}</p>}
      </div>

      <div className="side-card">
        <h3 className="side-heading">Summary</h3>
        <div className="summary-row">
          <span className="summary-name">Israel Guidance Presentation</span>
        </div>
        <p className="summary-meta">
          {durationMin ? `${durationMin} mins` : '40 mins'}
          {settings?.contact_name ? ` · with ${settings.contact_name}` : ''}
        </p>
        <p className="side-tz">🕒 All times shown in <strong>New York (Eastern)</strong> time, wherever you're booking from.</p>
      </div>
    </aside>
  )
}
