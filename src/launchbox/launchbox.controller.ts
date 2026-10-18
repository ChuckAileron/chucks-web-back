import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { LaunchboxService } from './launchbox.service.js';
import {
  ApplyBulkDto,
  ApplyOneDto,
  ApplyResultsCsvDto,
  BulkSearchDto,
  JobParamsDto,
  MatchRowsDto,
  ParseCsvDto,
  SearchSingleDto,
} from './dto/launchbox.dto.js';

@Controller('launchbox')
export class LaunchboxController {
  constructor(private readonly launchboxService: LaunchboxService) {}

  @Post('single')
  single(@Body() dto: SearchSingleDto) {
    return this.launchboxService.single(dto);
  }

  @Post('apply-one')
  applyOne(@Body() dto: ApplyOneDto) {
    return this.launchboxService.applyOne(dto);
  }

  @Post('csv/parse')
  parseCsv(@Body() dto: ParseCsvDto) {
    return this.launchboxService.parseCsvText(dto.csvText);
  }

  @Post('match-rows')
  matchRows(@Body() dto: MatchRowsDto) {
    return this.launchboxService.matchRows(dto);
  }

  @Post('bulk')
  startBulk(@Body() dto: BulkSearchDto) {
    return this.launchboxService.startBulk(dto);
  }

  @Get('bulk/:jobId')
  getJob(@Param() params: JobParamsDto) {
    return this.launchboxService.getJob(params.jobId);
  }

  @Get('bulk/:jobId/results')
  getJobResults(@Param() params: JobParamsDto) {
    return this.launchboxService.getJobResults(params.jobId);
  }

  @Post('bulk/:jobId/cancel')
  cancelJob(@Param() params: JobParamsDto) {
    return this.launchboxService.cancelJob(params.jobId);
  }

  @Post('apply-bulk')
  applyBulk(@Body() dto: ApplyBulkDto) {
    return this.launchboxService.applyBulk(dto);
  }

  @Post('apply-results-csv')
  applyResultsCsv(@Body() dto: ApplyResultsCsvDto) {
    return this.launchboxService.applyResultsCsv(dto);
  }
}
