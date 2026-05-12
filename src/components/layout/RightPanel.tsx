import React from 'react';
import { AnalysisResult } from '../../types';
import DecisionCard from './DecisionCard';
import AIDeepDive from './AIDeepDive';
import EvidenceChain from './EvidenceChain';
import KeyLevels from './KeyLevels';
import SentimentCompact from './SentimentCompact';

interface Props {
  result: AnalysisResult;
}

const RightPanel: React.FC<Props> = ({ result }) => {
  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto h-full" style={{ background: 'var(--bg2)' }}>
      <DecisionCard result={result} />
      <AIDeepDive result={result} />
      <EvidenceChain result={result} />
      <KeyLevels result={result} />
      <SentimentCompact result={result} />
    </div>
  );
};

export default RightPanel;
