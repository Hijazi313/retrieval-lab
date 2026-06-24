import { HttpException, type HttpStatus } from '@nestjs/common';

export interface ApplicationErrorOptions {
  code: string;
  detail: string;
  title?: string;
  type?: string;
  errors?: string[] | Record<string, unknown>;
}

export class ApplicationError extends HttpException {
  readonly code: string;
  readonly detail: string;
  readonly title?: string;
  readonly type?: string;
  readonly errors?: string[] | Record<string, unknown>;

  constructor(status: HttpStatus, options: ApplicationErrorOptions) {
    super(
      {
        code: options.code,
        detail: options.detail,
        ...(options.title === undefined ? {} : { title: options.title }),
        ...(options.type === undefined ? {} : { type: options.type }),
        ...(options.errors === undefined ? {} : { errors: options.errors }),
      },
      status,
    );

    this.code = options.code;
    this.detail = options.detail;
    this.title = options.title;
    this.type = options.type;
    this.errors = options.errors;
  }
}
