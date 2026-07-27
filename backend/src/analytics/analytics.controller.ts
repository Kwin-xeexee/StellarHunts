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

  onModuleInit() {
    this.analyticsService.seedData();
  }

  @Post('record-solve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async recordSolve(@Body() body: RecordSolveDto): Promise<void> {
    this.logger.log(`Received record-solve request: ${JSON.stringify(body)}`);
    const { userId, puzzleId, solveTime } = body;
    // Await so write errors surface as 5xx rather than being silently
    // dropped; the service internally falls back to in-memory on Redis
    // failure so this won't crash the request.
    await this.analyticsService.recordPuzzleSolveAsync(
      userId,
      puzzleId,
      solveTime,
    );
  }

  @Get('puzzles/most-solved')
  async getMostSolvedPuzzles(): Promise<
    Array<{ puzzleId: string; solveCount: number }>
  > {
    this.logger.log('Handling request for most solved puzzles.');
    return this.analyticsService.getMostSolvedPuzzlesAsync();
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
}
