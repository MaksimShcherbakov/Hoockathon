export interface Task {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  completed: boolean;
}

export interface User {
  email: string;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
