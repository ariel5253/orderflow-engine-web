import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../../testing/translations';
import stores from '../../../public/config/stores.json';
import { apiHeadersInterceptor } from './api-headers.interceptor';
import { Language } from './language';
import { StoreContext } from './store-context';

describe('apiHeadersInterceptor', () => {
  beforeEach(() => localStorage.clear());

  function setUp(language: Language): { http: HttpClient; backend: HttpTestingController } {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiHeadersInterceptor])),
        provideHttpClientTesting(),
        provideTestTranslations(language),
      ],
    });
    TestBed.inject(StoreContext).load(stores);
    return { http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController) };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sends the first configured store and the default language on every /api/ request, path and body unchanged', () => {
    const { http, backend } = setUp('es');
    const body = { paymentMethod: 'CASH', lines: [{ sku: 'BEV-COLA-350', qty: 40 }] };

    http.get('/api/v1/quotes/7f6c1a52-94bc-4e12-8801-b384f901a1c4').subscribe();
    http.post('/api/v1/quotes', body).subscribe();

    const read = backend.expectOne({ method: 'GET', url: '/api/v1/quotes/7f6c1a52-94bc-4e12-8801-b384f901a1c4' });
    const create = backend.expectOne({ method: 'POST', url: '/api/v1/quotes' });
    expect(read.request.urlWithParams).toBe('/api/v1/quotes/7f6c1a52-94bc-4e12-8801-b384f901a1c4');
    expect(read.request.body).toBeNull();
    expect(create.request.urlWithParams).toBe('/api/v1/quotes');
    expect(create.request.body).toEqual({ paymentMethod: 'CASH', lines: [{ sku: 'BEV-COLA-350', qty: 40 }] });
    for (const request of [read, create]) {
      expect(request.request.headers.keys().sort()).toEqual(['Accept-Language', 'X-Customer-Id', 'X-Tenant-Id']);
      expect(request.request.headers.get('X-Tenant-Id')).toBe('co-alpha');
      expect(request.request.headers.get('X-Customer-Id')).toBe('01a13cdb-cc00-7001-8001-000000000001');
      expect(request.request.headers.get('Accept-Language')).toBe('es');
      request.flush({});
    }
  });

  it('sends the active language', () => {
    const { http, backend } = setUp('en');

    http.get('/api/v1/quotes/7f6c1a52-94bc-4e12-8801-b384f901a1c4').subscribe();

    const request = backend.expectOne('/api/v1/quotes/7f6c1a52-94bc-4e12-8801-b384f901a1c4');
    expect(request.request.headers.get('Accept-Language')).toBe('en');
    expect(request.request.headers.get('X-Tenant-Id')).toBe('co-alpha');
    request.flush({});
  });

  it('sends the store the picker selects: switching the store changes both headers', () => {
    const { http, backend } = setUp('es');
    const context = TestBed.inject(StoreContext);

    context.select(stores[2]);
    http.get('/api/v1/products').subscribe();
    const ecuador = backend.expectOne('/api/v1/products');
    expect(ecuador.request.headers.get('X-Tenant-Id')).toBe('ec-alpha');
    expect(ecuador.request.headers.get('X-Customer-Id')).toBe('01a13cdb-cc00-7002-8001-000000000001');
    ecuador.flush({});

    context.select(stores[1]);
    http.get('/api/v1/products').subscribe();
    const south = backend.expectOne('/api/v1/products');
    expect(south.request.headers.get('X-Tenant-Id')).toBe('co-alpha');
    expect(south.request.headers.get('X-Customer-Id')).toBe('01a13cdb-cc00-7001-8001-000000000002');
    south.flush({});
  });

  it('remembers the selected store in the browser, and falls back to the first store when it is not configured', () => {
    setUp('es');
    TestBed.inject(StoreContext).select(stores[3]);
    TestBed.resetTestingModule();

    setUp('es');
    expect(TestBed.inject(StoreContext).current()).toEqual(stores[3]);
    TestBed.resetTestingModule();

    setUp('es');
    TestBed.inject(StoreContext).load(stores.slice(0, 2));
    expect(TestBed.inject(StoreContext).current()).toEqual(stores[0]);
    expect(() => TestBed.inject(StoreContext).select(stores[3])).toThrowError(/Not a configured store/);
  });

  it('leaves requests outside /api/ untouched', () => {
    const { http, backend } = setUp('es');

    http.get('/i18n/es.json').subscribe();

    const request = backend.expectOne('/i18n/es.json');
    expect(request.request.headers.keys()).toEqual([]);
    request.flush({});
  });
});

describe('stores.json', () => {
  it('lists the seeded demo stores of the four tenants, grouped by tenant, the first one a co-alpha customer with credit', () => {
    expect(stores.map((store) => `${store.tenantId}/${store.customerId}`)).toEqual([
      'co-alpha/01a13cdb-cc00-7001-8001-000000000001',
      'co-alpha/01a13cdb-cc00-7001-8001-000000000002',
      'ec-alpha/01a13cdb-cc00-7002-8001-000000000001',
      'ec-alpha/01a13cdb-cc00-7002-8001-000000000002',
      'gt-alpha/01a13cdb-cc00-7003-8001-000000000001',
      'gt-alpha/01a13cdb-cc00-7003-8001-000000000002',
      'pe-alpha/01a13cdb-cc00-7004-8001-000000000001',
      'pe-alpha/01a13cdb-cc00-7004-8001-000000000002',
    ]);
  });
});
