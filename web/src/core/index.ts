/**
 * @file      index.ts – Öffentliche Exporte des Core – Views importieren von @/core
 * @layer     Web · Core
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
export { ApiError, ApiService } from './ApiService';
export { CoreInteractor } from './CoreInteractor';
export { CoreProvider, useCore } from './CoreProvider';
export { Resource, ResourceFamily, type ResourceState } from './Resource';
export { useResource } from './useResource';
