import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AcceptanceChain } from './AcceptanceChain';
import { TrainerAcceptanceChain } from './TrainerAcceptanceChain';

export const AcceptanceChainRouter: React.FC = () => {
  const { primaryRole } = useAuth();
  return primaryRole === 'trainer' ? <TrainerAcceptanceChain /> : <AcceptanceChain />;
};
export default AcceptanceChainRouter;
