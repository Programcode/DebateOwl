import type { FactoidsInput, FactoidsOutput } from './schemas/factoids';

/** The input a factoids request sends: an empty region means global, and five sources unless asked otherwise. */
export function factoidsRequestInput(input: FactoidsInput): FactoidsInput {
  return {
    ...input,
    region: input.region?.trim() || 'Global',
    sourceCount: input.sourceCount || 5,
  };
}

/**
 * Keeps only verified factoids, up to the number of sources asked for, and
 * records how many were dropped. Runs on output that already passed FactoidsOutputSchema.
 */
export function selectVerifiedFactoids(output: FactoidsOutput, sourceCount: number | undefined): FactoidsOutput {
  const allFactoids = output.factoids;
  const verifiedFactoids = allFactoids.filter((factoid) => factoid.citation.verified === 'verified');
  const returnedFactoids = verifiedFactoids.slice(0, sourceCount || 5);
  return {
    ...output,
    factoids: returnedFactoids,
    filteredOutCount: Math.max(0, allFactoids.length - returnedFactoids.length),
  };
}
