// The web preview exists for screenshots, so the first run opens only when the
// URL asks, as the website's ?intro=show does: `?intro=show` opens the welcome
// and then the tour, `?intro=tour` the tour alone.
export interface FirstRunPlan {
  showIntro: boolean;
  tourDone: boolean;
}

export async function firstRunPlan(_userId: string): Promise<FirstRunPlan> {
  const requested = new URLSearchParams(window.location.search).get('intro');
  return { showIntro: requested === 'show', tourDone: requested !== 'show' && requested !== 'tour' };
}

export async function markIntroSeen(): Promise<void> {}

export async function markTourDone(_userId: string): Promise<void> {}
