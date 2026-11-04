/** Displays the server identity supplied by the page without selecting a source or destination. */
export function PanelServerDetails({ label, baseUrl }: { label: string; baseUrl: string }) {
  return <div className="panel-server-details">
    <span className="panel-server-label">{label}</span>
    <span className="panel-server-url">{baseUrl}</span>
  </div>
}
