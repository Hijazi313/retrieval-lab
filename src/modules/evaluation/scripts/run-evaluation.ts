import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateEnv } from '../../../config/env.schema';
import { EvaluationService } from '../evaluation.service';
import { EvaluationModule } from '../evaluation.module';
import type { CreateEvalRunDto } from '../dto/create-eval-run.dto';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    EvaluationModule,
  ],
})
class EvaluationCliModule {}

type CliOptions = CreateEvalRunDto & {
  minRecall?: number;
  minPrecision?: number;
  minMrr?: number;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(EvaluationCliModule, {
    logger: false,
  });

  try {
    const evaluationService = app.get(EvaluationService);
    const report = await evaluationService.createRun(options);
    const failures = evaluateThresholds(report.evalRun, options);

    printReport(report, options, failures);

    if (failures.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    strategy: 'hybrid',
    topK: 5,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = args[index + 1];

    if (!arg.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const value = inlineValue ?? nextValue;

    if (inlineValue === undefined) {
      index += 1;
    }

    applyOption(options, rawKey, value);
  }

  return options;
}

function applyOption(options: CliOptions, key: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing value for --${key}.`);
  }

  if (key === 'strategy') {
    options.strategy = value as CliOptions['strategy'];
    return;
  }

  if (key === 'fusionStrategy') {
    options.fusionStrategy = value as CliOptions['fusionStrategy'];
    return;
  }

  if (key === 'topK') {
    options.topK = parseIntegerOption(key, value);
    return;
  }

  if (key === 'rrfK') {
    options.rrfK = parseIntegerOption(key, value);
    return;
  }

  if (key === 'vectorWeight') {
    options.vectorWeight = parseNumberOption(key, value);
    return;
  }

  if (key === 'keywordWeight') {
    options.keywordWeight = parseNumberOption(key, value);
    return;
  }

  if (key === 'minRecall') {
    options.minRecall = parseNumberOption(key, value);
    return;
  }

  if (key === 'minPrecision') {
    options.minPrecision = parseNumberOption(key, value);
    return;
  }

  if (key === 'minMrr') {
    options.minMrr = parseNumberOption(key, value);
    return;
  }

  throw new Error(`Unknown option: --${key}.`);
}

function parseIntegerOption(key: string, value: string) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`--${key} must be an integer.`);
  }

  return parsed;
}

function parseNumberOption(key: string, value: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`--${key} must be a number.`);
  }

  return parsed;
}

function evaluateThresholds(
  evalRun: {
    averageRecallAtK: number;
    averagePrecisionAtK: number;
    meanReciprocalRank: number;
  },
  options: CliOptions,
) {
  const failures: string[] = [];

  if (
    options.minRecall !== undefined &&
    evalRun.averageRecallAtK < options.minRecall
  ) {
    failures.push(
      `Recall@K ${formatMetric(evalRun.averageRecallAtK)} < ${formatMetric(
        options.minRecall,
      )}`,
    );
  }

  if (
    options.minPrecision !== undefined &&
    evalRun.averagePrecisionAtK < options.minPrecision
  ) {
    failures.push(
      `Precision@K ${formatMetric(evalRun.averagePrecisionAtK)} < ${formatMetric(
        options.minPrecision,
      )}`,
    );
  }

  if (
    options.minMrr !== undefined &&
    evalRun.meanReciprocalRank < options.minMrr
  ) {
    failures.push(
      `MRR ${formatMetric(evalRun.meanReciprocalRank)} < ${formatMetric(
        options.minMrr,
      )}`,
    );
  }

  return failures;
}

function printReport(
  report: Awaited<ReturnType<EvaluationService['createRun']>>,
  options: CliOptions,
  failures: string[],
) {
  const run = report.evalRun;

  console.log(`Evaluation Run: ${run.strategy}@${run.topK}`);
  console.log(`Eval run id: ${run.id}`);
  console.log(`Questions scored: ${run.questionCount}`);
  console.log(`Skipped uncurated: ${run.skippedQuestionCount}`);
  console.log('');
  console.log(`Recall@K: ${formatMetric(run.averageRecallAtK)}`);
  console.log(`Precision@K: ${formatMetric(run.averagePrecisionAtK)}`);
  console.log(`MRR: ${formatMetric(run.meanReciprocalRank)}`);

  if (report.failedResults.length > 0) {
    console.log('');
    console.log(`Questions with missed expected chunks: ${report.failedResults.length}`);
  }

  if (
    options.minRecall !== undefined ||
    options.minPrecision !== undefined ||
    options.minMrr !== undefined
  ) {
    console.log('');
    console.log('Thresholds:');
    if (options.minRecall !== undefined) {
      console.log(`- minRecall: ${formatMetric(options.minRecall)}`);
    }
    if (options.minPrecision !== undefined) {
      console.log(`- minPrecision: ${formatMetric(options.minPrecision)}`);
    }
    if (options.minMrr !== undefined) {
      console.log(`- minMrr: ${formatMetric(options.minMrr)}`);
    }
  }

  console.log('');

  if (failures.length === 0) {
    console.log('PASS');
    return;
  }

  console.log('FAIL');
  failures.forEach((failure) => console.log(`- ${failure}`));
}

function formatMetric(value: number) {
  return value.toFixed(4);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
