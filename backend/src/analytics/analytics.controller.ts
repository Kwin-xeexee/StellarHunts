import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  OnModuleInit,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { PaginatedUserPuzzleHistory } from './analytics.service';

class RecordSolveDto {
  userId: string;
  puzzleId: string;
  solveTime: number;
}

@Controller('analytics')
export class AnalyticsController implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  async onModuleInit(): Promise<void> {
    // seedData now writes to Postgres, so it's async — await it so the
    // module isn't reported ready before the fixture rows exist, and
    // catch so a seeding failure (e.g. DB not migrated yet) doesn't
    // crash app boot.
    try {
      await this.analyticsService.seedData();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Analytics seedData failed: ${message}`);
    }
  }

  @Post('record-solve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordSolve(@Body() body: RecordSolveDto): Promise<void> {
    this.logger.log(`Received record-solve request: ${JSON.stringify(body)}`);
    const { userId, puzzleId, solveTime } = body;
    await this.analyticsService.recordPuzzleSolveAsync(
      userId,
      puzzleId,
      solveTime,
    );
  }

  @Get('puzzles/most-solved')
  async getMostSolvedPuzzles(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Array<{ puzzleId: string; solveCount: number }>> {
    this.logger.log('Handling request for most solved puzzles.');
    return this.analyticsService.getMostSolvedPuzzlesAsync(
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
  }

  @Get('puzzles/:puzzleId/average-solve-time')
  async getAverageSolveTime(
    @Param('puzzleId') puzzleId: string,
  ): Promise<{ puzzleId: string; averageSolveTime: number }> {
    this.logger.log(
      `Handling request for average solve time for puzzle ${puzzleId}.`,
    );
    const averageSolveTime =
      await this.analyticsService.getAverageSolveTimeAsync(puzzleId);
    return { puzzleId, averageSolveTime };
  }

  @Get('users/:userId/history')
  async getUserPuzzleHistory(
    @Param('userId') userId: string,
  ): Promise<Record<string, any>> {
    this.logger.log(`Handling request for user ${userId} puzzle history.`);
    const userHistoryMap =
      await this.analyticsService.getUserPuzzleStatsAsync(userId);

    const userHistoryObject: Record<string, any> = {};
    userHistoryMap.forEach((value, key) => {
      userHistoryObject[key] = value;
    });
    return userHistoryObject;
  }

  @Get('users/:userId/history/paginated')
  async getUserPuzzleHistoryPaginated(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<PaginatedUserPuzzleHistory> {
    this.logger.log(
      `Handling paginated history request for user ${userId} (page=${page}, limit=${limit}).`,
    );
    return this.analyticsService.getUserPuzzleHistoryPaginated(
      userId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }
}
