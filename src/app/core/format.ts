import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { FORMAT_LOCALE_KEY } from './language';

/*
 * Every number, rate and date on screen goes through Intl with the locale the active dictionary names
 * (app.formatLocale, SPEC §9). Decimal values stay the API's strings: Intl formats a decimal string exactly.
 */

/** The locale of the active dictionary. Read on every change detection, so a language switch reformats at once. */
export function activeFormatLocale(translate: TranslateService): string {
  const locale = translate.instant(FORMAT_LOCALE_KEY);
  if (typeof locale !== 'string' || locale === FORMAT_LOCALE_KEY) {
    throw new Error(`The active dictionary does not set ${FORMAT_LOCALE_KEY}`);
  }
  return locale;
}

/** A tax rate such as "0.190000", shown as a percentage. */
@Pipe({ name: 'rate', pure: false })
export class RatePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(rate: string): string {
    return new Intl.NumberFormat(activeFormatLocale(this.translate), { style: 'percent', maximumFractionDigits: 4 }).format(
      rate as Intl.StringNumericLiteral,
    );
  }
}

/** A unit or line count. */
@Pipe({ name: 'count', pure: false })
export class CountPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(count: number): string {
    return new Intl.NumberFormat(activeFormatLocale(this.translate), { maximumFractionDigits: 0 }).format(count);
  }
}

/** An ISO-8601 instant of the API, in the browser's time zone. */
@Pipe({ name: 'dateTime', pure: false })
export class DateTimePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(instant: string): string {
    return new Intl.DateTimeFormat(activeFormatLocale(this.translate), { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(instant),
    );
  }
}
