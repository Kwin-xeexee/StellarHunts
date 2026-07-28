import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/gaurds/roles.gaurds';

@Controller('reports')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @UseGuards(RolesGuard)
  @Roles('user')
  @Post()
  create(@Body() createReportDto: CreateReportDto, @Req() req: any) {
    const userId = req.user?.id ?? req.user?.sub ?? 1;
    return this.reportsService.create(createReportDto, userId);
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get()
  findAll() {
    return this.reportsService.findAll();
  }

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body('adminNote') adminNote?: string) {
    return this.reportsService.resolve(+id, adminNote);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateReportDto: UpdateReportDto) {
    return this.reportsService.update(+id, updateReportDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.reportsService.remove(+id);
  }
}
