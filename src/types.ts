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

export type Liability = {
  type: string;
  name: string;
  balance: number;
  institution: string;
};

export type ExitCode = 0 | 1 | 2 | 3 | 4 | 5;

export const EXIT = {
  OK: 0,
  AUTH_FAILED: 1,
  ELEMENT_NOT_FOUND: 2,
  INVALID_INPUT: 3,
  UNKNOWN: 4,
  BROWSER_MISSING: 5,
} as const satisfies Record<string, ExitCode>;
