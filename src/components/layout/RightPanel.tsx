import React from 'react';
import { AnalysisResult } from '../../types';
import DecisionCard from './DecisionCard';
import AIDeepDive from './AIDeepDive';

interface Props {
  result: AnalysisResult;
}

const RightPanel: React.FC<Props> = ({ result }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, background: 'var(--bg2)' }}>
      <DecisionCard result={result} />
      <AIDeepDive result={result} />
    </div>
  );
};

export default RightPanel;
