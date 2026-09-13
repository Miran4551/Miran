import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { ScheduleUnificationController } from './schedule-unification.controller';
import { SchedulesService } from './schedules.service';
import { ScheduleUnificationService } from './schedule-unification.service';
import { ScheduleTraineeSyncService } from './schedule-trainee-sync.service';
import { ScheduleDistributionService } from './schedule-distribution.service';
import { TraineeScheduleReaderService } from './trainee-schedule-reader.service';
import { ConflictEngineService } from './conflict-engine.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SchedulesController, ScheduleUnificationController],
  providers: [SchedulesService, ScheduleUnificationService, ScheduleTraineeSyncService, ScheduleDistributionService, TraineeScheduleReaderService, ConflictEngineService],
  exports: [SchedulesService, ScheduleUnificationService, ScheduleTraineeSyncService, ScheduleDistributionService, TraineeScheduleReaderService, ConflictEngineService],
})
export class SchedulesModule {}
