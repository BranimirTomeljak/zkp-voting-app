export enum ElectionState {
  Preparing,
  Active,
  Ended,
}

export interface Candidate {
  id: number;
  name: string;
  voteCount: number;
}

export interface CandidateBatch {
  name: string;
}
