import { formatDuration, type RoundFormat } from '@/lib/free-tools/formats';

/** A format's speech order as a plain table, with prep, what varies, and where the numbers come from. */
export function FormatReference({ format, headingLevel = 3 }: { format: RoundFormat; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const hasPoi = format.segments.some((segment) => segment.poi);
  return (
    <section aria-labelledby={`format-${format.id}`} className="mt-8">
      <Heading id={`format-${format.id}`}>{format.name}</Heading>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th scope="col" className="py-2 pr-3 font-medium">Speech</th>
              <th scope="col" className="py-2 pr-3 font-medium">Side</th>
              <th scope="col" className="py-2 pr-3 font-medium">Time</th>
              {hasPoi && <th scope="col" className="py-2 font-medium">Points of information</th>}
            </tr>
          </thead>
          <tbody>
            {format.segments.map((segment) => (
              <tr key={segment.id} className="border-b border-border/60">
                <td className="py-2 pr-3">
                  <span className="font-medium">{segment.short}</span>
                  <span className="text-muted-foreground"> {segment.label}</span>
                </td>
                <td className="py-2 pr-3">{segment.side === 'both' ? 'Both' : format.sideNames[segment.side === 'a' ? 0 : 1]}</td>
                <td className="py-2 pr-3 tabular-nums">{formatDuration(segment.seconds)}</td>
                {hasPoi && (
                  <td className="py-2">
                    {segment.poi ? `${formatDuration(segment.poi.opensAt)} to ${formatDuration(segment.poi.closesAt)}` : 'None'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">
        {format.prepSeconds > 0 ? `Prep time: ${formatDuration(format.prepSeconds)} per side, used between speeches. ` : 'No in-round prep time. '}
        {format.note}
      </p>
      {format.sources.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Source{format.sources.length > 1 ? 's' : ''}:{' '}
          {format.sources.map((source, index) => (
            <span key={source.url}>
              {index > 0 && '; '}
              <a href={source.url} rel="noopener" target="_blank">{source.label}</a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
