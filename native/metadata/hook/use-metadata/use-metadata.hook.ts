import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import { useMetadataService } from '../../../../shared/metadata/hook/use-metadata-service';
import { useDependency } from '../../../runtime/scope/runtime-scope-context';

export const useMetadata = (): MetadataServiceInterface => useMetadataService(useDependency(MetadataServiceInterface));
