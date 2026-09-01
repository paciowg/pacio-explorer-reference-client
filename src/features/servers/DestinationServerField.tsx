/** Presents a saved-server destination choice without changing the application's active source server. */
import type { SavedServer } from './serverStorage'

type DestinationServerFieldProps = {
  id: string
  servers: SavedServer[]
  value: string
  disabled: boolean
  onChange: (baseUrl: string) => void
}

export function DestinationServerField(props: DestinationServerFieldProps) {
  return (
    <div className="field-group">
      <label htmlFor={props.id}>Destination FHIR server</label>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        disabled={props.disabled}
        required
      >
        <option value="">Select a destination server</option>
        {props.servers.map((server) => (
          <option key={server.id} value={server.baseUrl}>
            {server.label} ({server.baseUrl})
          </option>
        ))}
      </select>
      <small className="helper-text">
        The Bundle and DocumentReference will be written here. The patient will be copied if no
        match is found.
      </small>
    </div>
  )
}
