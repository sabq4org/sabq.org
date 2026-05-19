declare module "react-big-calendar" {
  import type { ComponentType, CSSProperties, ReactNode } from "react";

  export type View = "month" | "week" | "work_week" | "day" | "agenda";

  export const Views: {
    MONTH: "month";
    WEEK: "week";
    WORK_WEEK: "work_week";
    DAY: "day";
    AGENDA: "agenda";
  };

  export function momentLocalizer(moment: unknown): unknown;

  export interface CalendarProps<TEvent extends object = object> {
    localizer: unknown;
    events?: TEvent[];
    startAccessor?: keyof TEvent | string | ((event: TEvent) => Date);
    endAccessor?: keyof TEvent | string | ((event: TEvent) => Date);
    view?: View;
    date?: Date;
    onNavigate?: (date: Date) => void;
    onView?: (view: View) => void;
    components?: Record<string, ComponentType<any> | Record<string, ComponentType<any>> | null>;
    formats?: Record<string, unknown>;
    messages?: Record<string, string | ((...args: any[]) => ReactNode)>;
    rtl?: boolean;
    style?: CSSProperties;
  }

  export const Calendar: ComponentType<CalendarProps<any>>;
}
