import React, { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CircularProgress } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const LogbookTrainerPage = lazy(() => import('./LogbookTrainerPage'));
const HospitalEvaluationInbox = lazy(() => import('./HospitalEvaluationInbox'));
const AcademicLogbook = lazy(() => import('./AcademicLogbook'));

/** Route the shared logbook by persona without replacing the trainer evaluation workspace. */
export const LogbookRouter: React.FC = () => {
  const { hasAnyRole } = useAuth();
  const [params] = useSearchParams();
  const isHospital = hasAnyRole(['hospital_training_admin']);
  const isAcademic = hasAnyRole(['academic_supervisor']);
  const isEvaluationsTab = params.get('tab') === 'evaluations';

  const content = isAcademic
    ? <AcademicLogbook />
    : isHospital && isEvaluationsTab
      ? <HospitalEvaluationInbox />
      : <LogbookTrainerPage />;

  return <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><CircularProgress /></div>}>{content}</Suspense>;
};

export default LogbookRouter;
