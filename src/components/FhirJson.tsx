/** Displays complete FHIR JSON as escaped, syntax-colored text without changing resource values. */
import type { Resource } from 'fhir/r4'

export function FhirJson({ resource }: { resource: Resource }) {
  const json = JSON.stringify(resource, null, 2)
  const tokens = json.split(/("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g)
  return <pre className="fhir-json" tabIndex={0} aria-label={`${resource.resourceType} JSON`}><code>
    {tokens.map((token, index) => {
      const kind = token.startsWith('"') ? (token.endsWith(':') ? 'key' : 'string')
        : /^(true|false|null)$/.test(token) ? 'literal'
          : /^-?\d/.test(token) ? 'number' : undefined
      return kind ? <span key={index} className={`json-${kind}`}>{token}</span> : token
    })}
  </code></pre>
}
