// Reuse the real backend, including Firebase verification and PostgreSQL.
// Do not start a listening server inside a Vercel function.
// Bundle the dependency graph for Vercel's CommonJS loader without changing
// Firebase Admin or its signature-verification dependencies.
import backend from '../.vercel-backend/server.cjs';
export default backend.default;
