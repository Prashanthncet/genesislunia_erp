import { Global, Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { DocumentStorage } from './document-storage.service';
import { StorageService } from './storage.service';

/**
 * Global so any module can inject StorageService. It is imported by AdmissionsModule and
 * StudentsModule (app.module.ts is owned elsewhere); Nest instantiates a module once no
 * matter how many modules import it, so FilesController is registered a single time.
 */
@Global()
@Module({
  controllers: [FilesController],
  providers: [StorageService, DocumentStorage],
  exports: [StorageService, DocumentStorage],
})
export class StorageModule {}
