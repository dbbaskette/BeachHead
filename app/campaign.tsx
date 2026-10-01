'use client';
import { lazy, Suspense, useReducer } from 'react';
import { campaignReducer, INITIAL_CAMPAIGN } from '@/lib/campaign';
import NavalGame from './naval-game';
import PillboxGame from './pillbox-game';
const FlakGame = lazy(() => import('./flak-game'));
const AirGame = lazy(() => import('./air-game'));
const BunkerGame = lazy(() => import('./bunker-game'));

export default function Campaign() {
  const [{ mission, campaign }, dispatch] = useReducer(
    campaignReducer,
    INITIAL_CAMPAIGN,
  );
  const menu = () => dispatch({ type: 'menu' });
  const advance = () => dispatch({ type: 'advance' });
  return mission === 'naval' ? (
    <NavalGame
      campaign={campaign}
      onStart={(campaign) =>
        dispatch({ type: 'begin', mission: 'naval', campaign })
      }
      onContinue={advance}
      onPractice={() =>
        dispatch({ type: 'begin', mission: 'beach', campaign: false })
      }
      onFlak={() =>
        dispatch({ type: 'begin', mission: 'flak', campaign: false })
      }
      onAir={() => dispatch({ type: 'begin', mission: 'air', campaign: false })}
      onBunker={() =>
        dispatch({ type: 'begin', mission: 'bunker', campaign: false })
      }
    />
  ) : mission === 'flak' ? (
    <Suspense
      fallback={<div className="air-loading">Preparing the battery…</div>}
    >
      <FlakGame campaign={campaign} onContinue={advance} onReturn={menu} />
    </Suspense>
  ) : mission === 'air' ? (
    <Suspense
      fallback={<div className="air-loading">Preparing air assault…</div>}
    >
      <AirGame campaign={campaign} onContinue={advance} onReturn={menu} />
    </Suspense>
  ) : mission === 'bunker' ? (
    <Suspense
      fallback={<div className="air-loading">Preparing the bunker…</div>}
    >
      <BunkerGame onReturn={menu} />
    </Suspense>
  ) : (
    <PillboxGame campaign={campaign} onReturn={menu} />
  );
}
