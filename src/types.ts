export type Source = 'Greenhouse' | 'Workday' | 'Other';
export type Status = 'Applied' | 'Interviewing' | 'Rejected' | 'Offer';

export type JobApplication = {
  company: string;
  role: string;
  location: string;
  source: Source;
  url: string;
  status: Status;
  notes: string;
};

export type Settings = {
  appsScriptUrl: string;
  secret: string;
};

export type SheetResponse = {
  ok: boolean;
  result?: 'added' | 'duplicate';
  error?: string;
};