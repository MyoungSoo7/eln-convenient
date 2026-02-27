/**
 * API 모듈 통합 re-export
 * 사용법: import { authApi, notesApi, inventoryApi } from '@/api';
 */
export * as authApi from './auth';
export * as notesApi from './notes';
export * as signaturesApi from './signatures';
export * as inventoryApi from './inventory';
export * as schedulerApi from './scheduler';
export * as searchApi from './search';
export * as aiApi from './ai';
export * as filesApi from './files';
export { apiClient } from './client';
export type { ApiResponse } from './client';
