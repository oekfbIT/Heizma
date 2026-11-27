/**
 * @file      index.ts – Typen und Konstanten aller Module an einer Stelle
 * @layer     Web · Module
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
/** Typen aller Module an einer Stelle – Views importieren von hier */
export type * from './anfragen/types';
export type * from './routen/types';
export type * from './system/types';
export type * from './techniker/types';
export { NO_REGION, cityOf } from './anfragen/AnfragenInteractor';
export { ROUTE_LEVEL } from './routen/RoutenInteractor';
export { inPolygon, parseRegion, regionName, regionPresets, serializeRegion, type RegionPreset } from './techniker/TechnikerInteractor';
