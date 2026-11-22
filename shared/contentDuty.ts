// Days are indexed from Sunday. An end earlier than the start is on the following day.
export interface ContentDutyShift {
  days: number[];
  startHour: number;
  endHour: number;
}

export interface ContentDutyManager {
  key: string;
  name: string;
  online: boolean | null;
  shifts: ContentDutyShift[];
}

export interface ContentDutyResponse {
  managers: ContentDutyManager[];
}
