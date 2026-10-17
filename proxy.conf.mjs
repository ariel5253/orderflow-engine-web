// Development server proxy (npm start). The client calls only relative /api/ paths; the dev server forwards them to
// the API, so the browser sees one origin and the API needs no CORS. API_UPSTREAM overrides the default.
const target = process.env['API_UPSTREAM'] ?? 'http://localhost:8080';

export default {
  '/api/': { target, secure: false },
};
