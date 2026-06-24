import { HttpStatus } from '@nestjs/common';

import { ApplicationError } from '../../common/errors/application-error';

export class DocumentNotFoundError extends ApplicationError {
  constructor(documentId: string) {
    super(HttpStatus.NOT_FOUND, {
      code: 'DOCUMENT_NOT_FOUND',
      title: 'Document Not Found',
      type: 'https://retrieval-lab.dev/problems/documents/document-not-found',
      detail: `Document not found: ${documentId}`,
    });
  }
}
