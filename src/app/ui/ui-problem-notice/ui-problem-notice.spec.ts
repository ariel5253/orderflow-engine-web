import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../../../testing/translations';
import { Language } from '../../core/language';
import { ApiFailure, Problem, isRetryable, toApiFailure } from '../../core/problem';
import { UiProblemNotice } from './ui-problem-notice';

const PROBLEM: Problem = {
  type: 'https://orderflow-engine.example/problems/quote-not-found',
  title: 'Cotización no encontrada',
  detail: 'No existe una cotización con ese identificador para este cliente.',
  status: 404,
  instance: '/api/v1/quotes/7f6c1a52-94bc-4e12-8801-b384f901a1c4',
  code: 'QUOTE_NOT_FOUND',
  correlationId: '5b1e9c7a-1f2e-4d3c-9a8b-7c6d5e4f3a2b',
};

@Component({
  imports: [UiProblemNotice],
  template: '<ui-problem-notice [failure]="failure" [actionLabel]="actionLabel" (action)="actions = actions + 1" />',
})
class NoticeHost {
  failure: ApiFailure = { kind: 'noAnswer' };
  actionLabel: string | null = null;
  actions = 0;
}

async function render(
  failure: ApiFailure,
  actionLabel: string | null,
  language: Language = 'es',
): Promise<ComponentFixture<NoticeHost>> {
  TestBed.configureTestingModule({ providers: [provideTestTranslations(language)] });
  const fixture = TestBed.createComponent(NoticeHost);
  fixture.componentInstance.failure = failure;
  fixture.componentInstance.actionLabel = actionLabel;
  await fixture.whenStable();
  return fixture;
}

function texts(fixture: ComponentFixture<NoticeHost>): string[] {
  return [...fixture.nativeElement.querySelectorAll('ui-text')].map((node: Element) => node.textContent?.trim() ?? '');
}

describe('ui-problem-notice', () => {
  it("shows the API's title and detail as sent, the code, the first 8 characters of correlationId and the action it is given", async () => {
    const fixture = await render({ kind: 'problem', problem: PROBLEM }, 'Reintentar');

    expect(texts(fixture)).toEqual([
      'Cotización no encontrada',
      'No existe una cotización con ese identificador para este cliente.',
      'Código QUOTE_NOT_FOUND · Ref. 5b1e9c7a',
      'Reintentar',
    ]);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();
    button.click();
    expect(fixture.componentInstance.actions).toBe(2);
  });

  it('shows no action when it is given none', async () => {
    const fixture = await render({ kind: 'problem', problem: PROBLEM }, null);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(texts(fixture)).toHaveLength(3);
  });

  it('shows the web text problem.network for a request with no answer', async () => {
    const spanish = await render({ kind: 'noAnswer' }, 'Reintentar');
    expect(texts(spanish)).toEqual([
      'No pudimos comunicarnos con el servidor',
      'Revisa tu conexión e inténtalo de nuevo.',
      'Reintentar',
    ]);
    TestBed.resetTestingModule();

    const english = await render({ kind: 'noAnswer' }, 'Retry', 'en');
    expect(texts(english)).toEqual(['We could not reach the server', 'Check your connection and try again.', 'Retry']);
  });

  it('shows the same web text for an answer that is not a problem, with only the action it is given', async () => {
    const fixture = await render({ kind: 'unexpectedAnswer' }, null);
    expect(texts(fixture)).toEqual(['No pudimos comunicarnos con el servidor', 'Revisa tu conexión e inténtalo de nuevo.']);
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
  });
});

describe('toApiFailure', () => {
  it('keeps a problem body as the API sent it', () => {
    const failure = toApiFailure(new HttpErrorResponse({ status: 404, error: PROBLEM }));
    expect(failure).toEqual({ kind: 'problem', problem: PROBLEM });
    expect(isRetryable(failure)).toBe(false);
  });

  it('reads no response, and a 5xx without a problem body, as no answer', () => {
    const offline = toApiFailure(new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }));
    const proxy = toApiFailure(new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' }));
    const unavailable = toApiFailure(new HttpErrorResponse({ status: 503, error: null }));
    expect(offline).toEqual({ kind: 'noAnswer' });
    expect(proxy).toEqual({ kind: 'noAnswer' });
    expect(unavailable).toEqual({ kind: 'noAnswer' });
    expect(isRetryable(offline)).toBe(true);
    expect(isRetryable(proxy)).toBe(true);
    expect(isRetryable(unavailable)).toBe(true);
  });

  it('reads a 4xx without a problem body as an unexpected answer, which is not retried', () => {
    const misrouted = toApiFailure(new HttpErrorResponse({ status: 404, error: '<html>Not Found</html>' }));
    const tooLarge = toApiFailure(new HttpErrorResponse({ status: 413, error: null }));
    expect(misrouted).toEqual({ kind: 'unexpectedAnswer' });
    expect(tooLarge).toEqual({ kind: 'unexpectedAnswer' });
    expect(isRetryable(misrouted)).toBe(false);
    expect(isRetryable(tooLarge)).toBe(false);
  });

  it('retries INTERNAL_ERROR and IDEMPOTENCY_KEY_IN_PROGRESS, and no other code', () => {
    const withCode = (code: string, status: number): ApiFailure => ({ kind: 'problem', problem: { ...PROBLEM, code, status } });
    expect(isRetryable(withCode('INTERNAL_ERROR', 500))).toBe(true);
    expect(isRetryable(withCode('IDEMPOTENCY_KEY_IN_PROGRESS', 409))).toBe(true);
    expect(isRetryable(withCode('QUOTE_NOT_FOUND', 404))).toBe(false);
    expect(isRetryable(withCode('TENANT_NOT_FOUND', 400))).toBe(false);
  });
});
