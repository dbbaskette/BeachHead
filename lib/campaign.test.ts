import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaignReducer, INITIAL_CAMPAIGN, type Mission } from './campaign';

void test('campaign advances from naval approach to antiaircraft defense to air assault to beach defense, then ends', () => {
  let state = campaignReducer(INITIAL_CAMPAIGN, {
    type: 'begin',
    mission: 'naval',
    campaign: true,
  });
  const visited: Mission[] = [state.mission];
  for (let i = 0; i < 3; i++) {
    state = campaignReducer(state, { type: 'advance' });
    assert.equal(state.campaign, true);
    visited.push(state.mission);
  }
  assert.deepEqual(visited, ['naval', 'flak', 'air', 'beach']);
  assert.deepEqual(
    campaignReducer(state, { type: 'advance' }),
    INITIAL_CAMPAIGN,
  );
});

void test('direct selection opens the chosen mission without campaign continuation', () => {
  for (const mission of [
    'naval',
    'flak',
    'air',
    'beach',
    'bunker',
    'tank',
  ] as const) {
    const state = campaignReducer(
      { mission: 'air', campaign: true },
      { type: 'begin', mission, campaign: false },
    );
    assert.deepEqual(state, { mission, campaign: false });
    assert.deepEqual(
      campaignReducer(state, { type: 'advance' }),
      INITIAL_CAMPAIGN,
    );
  }
});

void test('menu return clears campaign progression from every mission', () => {
  for (const mission of [
    'naval',
    'flak',
    'air',
    'beach',
    'bunker',
    'tank',
  ] as const) {
    const menu = campaignReducer({ mission, campaign: true }, { type: 'menu' });
    assert.deepEqual(menu, INITIAL_CAMPAIGN);
    assert.deepEqual(
      campaignReducer(menu, {
        type: 'begin',
        mission: 'naval',
        campaign: true,
      }),
      { mission: 'naval', campaign: true },
    );
  }
});
