/**
 * The colour slugs a chart department may use. Each one maps, on the PWA side, to
 * a design-system token (`--color-<slug>` → text-<slug> / bg-<slug>/10 …), so the
 * set here MUST stay in step with the department colours defined in the front end
 * (app/globals.css + lib/chart-meta.ts).
 *
 * The colour is a plain string in the database (so re-theming needs NO migration),
 * but admin input is validated against this set, and the labels drive the admin
 * colour dropdown. To add a colour, add its token in the PWA, then a slug here.
 */
export const CHART_DEPARTMENT_COLORS = [
  'computer',
  'material',
  'mechanical',
  'mining',
  'chemical',
  'biomedical',
  'electrical',
] as const;

export type ChartDepartmentColor = (typeof CHART_DEPARTMENT_COLORS)[number];

/** The colour used when none is supplied or an unknown one slips through. */
export const DEFAULT_CHART_COLOR: ChartDepartmentColor = 'computer';

/** Persian labels shown to staff in the admin colour dropdown. */
export const CHART_COLOR_LABELS: Record<ChartDepartmentColor, string> = {
  computer: 'آبی (کامپیوتر)',
  material: 'نارنجی (مواد)',
  mechanical: 'فیروزه‌ای (مکانیک)',
  mining: 'قهوه‌ای (معدن)',
  chemical: 'بنفش (شیمی)',
  biomedical: 'صورتی (پزشکی)',
  electrical: 'زرد (برق)',
};

/** Type-guard: is this slug one of the known department colours? */
export function isKnownChartColor(
  color: string,
): color is ChartDepartmentColor {
  return (CHART_DEPARTMENT_COLORS as readonly string[]).includes(color);
}
