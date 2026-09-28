import { Body, Controller, Module, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { financingCalculator, landedCost, importVsLocal, runScenarios } from '@firmplant/engines';
import { Public } from '../auth/decorators';
import { ZodPipe } from '../common/problem.filter';

const FinancingDto = z.object({
  projectCost: z.number().positive(), equityPct: z.number().min(0).max(100), annualRatePct: z.number().min(0).max(60),
  tenureYears: z.number().min(1).max(25), graceMonths: z.number().int().min(0).max(60), annualEbitda: z.number(),
});
const LandedDto = z.object({
  supplierPriceFob: z.number().nonnegative(), freight: z.number().nonnegative(), insurancePctOfCfr: z.number().min(0).max(20),
  dutyPctOfCif: z.number().min(0).max(200), otherTaxesPctOfCif: z.number().min(0).max(100).optional(), vatPct: z.number().min(0).max(50).optional(), includeVat: z.boolean().optional(),
  portCharges: z.number().nonnegative(), clearance: z.number().nonnegative(), inlandTransport: z.number().nonnegative(), financingHandlingPctOfFob: z.number().min(0).max(20).optional(),
  localCost: z.number().positive().optional(), thresholdPct: z.number().min(0).max(100).optional(),
});

@Controller('calculators')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class CalculatorsController {
  @Public() @Post('financing')
  financing(@Body(new ZodPipe(FinancingDto)) dto: z.infer<typeof FinancingDto>) { return financingCalculator(dto); }

  @Public() @Post('landed-cost')
  landed(@Body(new ZodPipe(LandedDto)) dto: z.infer<typeof LandedDto>) {
    const { localCost, thresholdPct, ...input } = dto;
    const r = landedCost(input);
    return { ...r, comparison: localCost ? importVsLocal(r.total, localCost, thresholdPct) : null };
  }

  /** Stateless scenario run (the admin endpoint persists versioned models). Body is validated inside the engine types. */
  @Public() @Post('financial-model')
  model(@Body() inputs: any) { return runScenarios(inputs); }
}

@Module({ controllers: [CalculatorsController] })
export class CalculatorsModule {}
