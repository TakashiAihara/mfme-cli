export type ISODate = string;

export type Transaction = {
  id: string;
  date: ISODate;
  amount: number;
  account: string;
  category: CategoryRef | null;
  memo: string | null;
  title: string;
  isTransfer: boolean;
  isManualEntry: boolean;
};

export type CategoryRef = {
  largeId: string;
  largeName: string;
  middleId: string;
  middleName: string;
};

export type CategoryMeta = {
  large: Array<{ id: string; name: string }>;
  middle: Array<{ id: string; name: string; largeId: string }>;
  updatedAt: ISODate;
};

export type ExitCode =
  | 0
  | 1
  | 2
  | 3
  | 4;

export const EXIT = {
  OK: 0,
  AUTH_FAILED: 1,
  ELEMENT_NOT_FOUND: 2,
  INVALID_INPUT: 3,
  UNKNOWN: 4,
} as const satisfies Record<string, ExitCode>;
