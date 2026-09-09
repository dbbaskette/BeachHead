'use client';
import { useState } from 'react';
import NavalGame from './naval-game';
import PillboxGame from './pillbox-game';

export default function Campaign() {
  const [stage, setStage] = useState<1 | 2>(1);
  return stage === 1 ? (
    <NavalGame onContinue={() => setStage(2)} onPractice={() => setStage(2)} />
  ) : (
    <PillboxGame onReturn={() => setStage(1)} />
  );
}
