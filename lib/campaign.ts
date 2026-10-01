export type Mission = 'naval' | 'air' | 'beach' | 'bunker';
export type CampaignState = { mission: Mission; campaign: boolean };
export type CampaignAction =
  | { type: 'begin'; mission: Mission; campaign: boolean }
  | { type: 'advance' }
  | { type: 'menu' };

export const INITIAL_CAMPAIGN: CampaignState = {
  mission: 'naval',
  campaign: false,
};
const nextMission: Record<Mission, Mission | null> = {
  naval: 'air',
  air: 'beach',
  beach: null,
  bunker: null,
};

export function campaignReducer(
  state: CampaignState,
  action: CampaignAction,
): CampaignState {
  if (action.type === 'begin')
    return { mission: action.mission, campaign: action.campaign };
  if (action.type === 'menu' || !state.campaign) return INITIAL_CAMPAIGN;
  const next = nextMission[state.mission];
  return next ? { mission: next, campaign: true } : INITIAL_CAMPAIGN;
}
