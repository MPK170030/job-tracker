export type Source = 'Greenhouse' | 'Workday' | 'Ashby' | 'Other';
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

export type ExtractedJob = {
  role?: string,
  company?: string,
  location?: string,
  jobId?: string,
  url: string,
  source: Source,
  capturedAt: number
}

export type Settings = {
  appsScriptUrl: string;
  secret: string;
};

export type SheetResponse = {
  ok: boolean;
  result?: 'added' | 'duplicate';
  error?: string;
};