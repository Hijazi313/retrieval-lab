import { Injectable } from '@nestjs/common';

@Injectable()
export class RunsService {
  compareRuns() {
    throw new Error(
      'Not implemented: compare retrieval run metrics and explanations.',
    );
  }
}
