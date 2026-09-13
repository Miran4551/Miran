import { Module } from '@nestjs/common';
import { LogbookController } from './logbook.controller';
import { LogbookFixesController } from './logbook-fixes.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LogbookController, LogbookFixesController],
})
export class LogbookModule {}
