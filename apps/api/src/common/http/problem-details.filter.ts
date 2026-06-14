import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ProblemDetailsBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: string[] | Record<string, unknown>;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const problem = this.buildProblemDetails(exception, request, status);
    response.status(status).json(problem);
  }

  private buildProblemDetails(
    exception: unknown,
    request: Request,
    status: number,
  ): ProblemDetailsBody {
    if (!(exception instanceof HttpException)) {
      return {
        type: this.problemType('internal-server-error'),
        title: 'Internal Server Error',
        status,
        detail: 'An unexpected error occurred.',
        instance: request.url,
      };
    }

    const exceptionResponse = exception.getResponse();
    const title = this.httpStatusTitle(status);
    const details = this.extractDetails(exceptionResponse);

    return {
      type: this.problemType(this.problemSlug(status)),
      title,
      status,
      detail: details.detail,
      instance: request.url,
      ...(details.errors === undefined ? {} : { errors: details.errors }),
    };
  }

  private extractDetails(response: string | object): {
    detail: string;
    errors?: string[] | Record<string, unknown>;
  } {
    if (typeof response === 'string') {
      return { detail: response };
    }

    const body = response as {
      message?: string | string[];
      error?: string;
      detail?: string;
      errors?: string[] | Record<string, unknown>;
    };

    if (body.detail) {
      return {
        detail: body.detail,
        ...(body.errors === undefined ? {} : { errors: body.errors }),
      };
    }

    if (Array.isArray(body.message)) {
      return {
        detail: body.message.join(' '),
        errors: body.message,
      };
    }

    if (typeof body.message === 'string') {
      return {
        detail: body.message,
        ...(body.errors === undefined ? {} : { errors: body.errors }),
      };
    }

    if (typeof body.error === 'string') {
      return { detail: body.error };
    }

    return { detail: 'The request could not be processed.' };
  }

  private problemType(slug: string) {
    return `https://retrieval-lab.dev/problems/${slug}`;
  }

  private problemSlug(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'bad-request';
      case HttpStatus.NOT_FOUND:
        return 'not-found';
      case HttpStatus.CONFLICT:
        return 'conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'unprocessable-entity';
      default:
        return 'http-error';
    }
  }

  private httpStatusTitle(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'Bad Request';
      case HttpStatus.NOT_FOUND:
        return 'Not Found';
      case HttpStatus.CONFLICT:
        return 'Conflict';
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return 'Unprocessable Entity';
      case HttpStatus.INTERNAL_SERVER_ERROR:
        return 'Internal Server Error';
      default:
        return 'Request Failed';
    }
  }
}

