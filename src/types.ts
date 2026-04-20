export interface UserConfig {
  initialBalance: number;
  monthlyLimit: number;
  currentBalance: number;
  lastResetDate?: string;
}

export interface Transaction {
  id?: string;
  amount: number;
  type: 'credit' | 'debit';
  category: string;
  description: string;
  date: string;
  screenshotRef?: string;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
  }
}
