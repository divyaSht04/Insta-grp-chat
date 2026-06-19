export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

export interface PublicUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
