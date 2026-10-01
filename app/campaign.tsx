'use client';
import { lazy, Suspense, useState } from 'react';
import NavalGame from './naval-game';
import PillboxGame from './pillbox-game';
const AirGame = lazy(() => import('./air-game'));

export default function Campaign() {
  const [stage, setStage] = useState<1 | 2 | 3>(1);
  const [campaign, setCampaign] = useState(false);
  const menu = () => {
    setCampaign(false);
    setStage(1);
  };
  return stage === 1 ? (
    <NavalGame
      campaign={campaign}
      onStart={setCampaign}
      onContinue={() => setStage(2)}
      onPractice={() => {
        setCampaign(false);
        setStage(2);
      }}
      onAir={() => {
        setCampaign(false);
        setStage(3);
      }}
    />
  ) : stage === 2 ? (
    <PillboxGame
      campaign={campaign}
      onContinue={() => setStage(3)}
      onReturn={menu}
    />
  ) : (
    <Suspense
      fallback={<div className="air-loading">Preparing air assault…</div>}
    >
      <AirGame campaign={campaign} onReturn={menu} />
    </Suspense>
  );
}
